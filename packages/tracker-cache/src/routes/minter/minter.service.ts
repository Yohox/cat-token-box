import { Injectable, OnModuleInit } from '@nestjs/common';
import { TokenService } from '../token/token.service';
import { InjectRepository } from '@nestjs/typeorm';
import { TxOutEntity } from '../../entities/txOut.entity';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { Constants } from '../../common/constants';
import { BlockService } from '../../services/block/block.service';
import { sleep } from '../../common/utils';
import { byteString2Int } from 'scrypt-ts';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import btc = require('bitcore-lib-inquisition');
import axios from 'axios';
import { Tap } from '@cmdcode/tapscript';
import { RpcService } from 'src/services/rpc/rpc.service';

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  minterMd5: string;
}
export interface TokenMetadata {
  info: TokenInfo;
  tokenId: string;
  /** token p2tr address */
  tokenAddr: string;
  /** minter p2tr address */
  minterAddr: string;
  genesisTxid: string;
  revealTxid: string;
  timestamp: number;
}
export interface OpenMinterTokenInfo extends TokenInfo {
  max: bigint;
  limit: bigint;
  premine: bigint;
}
const ISSUE_PUBKEY =
  '0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0';

export function toP2tr(address: string | btc.Address): string {
  const p2trAddress =
    typeof address === 'string' ? btc.Address.fromString(address) : address;

  if (p2trAddress.type !== 'taproot') {
    throw new Error(`address ${address} is not taproot`);
  }

  return btc.Script.fromAddress(address).toHex();
}

export function scaleByDecimals(amount: bigint, decimals: number) {
  return amount * BigInt(Math.pow(10, decimals));
}

export function scaleConfig(config: OpenMinterTokenInfo): OpenMinterTokenInfo {
  const clone = Object.assign({}, config);

  clone.max = scaleByDecimals(config.max, config.decimals);
  clone.premine = scaleByDecimals(config.premine, config.decimals);
  clone.limit = scaleByDecimals(config.limit, config.decimals);

  return clone;
}

export function script2P2TR(script: Buffer): {
  p2tr: string;
  tapScript: string;
  cblock: string;
} {
  const tapScript = Tap.encodeScript(script);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [p2tr, cblock] = Tap.getPubKey(ISSUE_PUBKEY, {
    target: tapScript,
  });
  return {
    p2tr: new btc.Script(`OP_1 32 0x${p2tr}}`).toHex(),
    tapScript: tapScript,
    cblock,
  };
}

@Injectable()
export class MinterService implements OnModuleInit {
  private cacheInfo = {}
  private solvedTx = {}
  private txMap = {}
  constructor(
    private readonly rpcService: RpcService,
    private readonly blockService: BlockService,
    private readonly tokenService: TokenService,
    @InjectRepository(TxOutEntity)
    private readonly txOutRepository: Repository<TxOutEntity>,
  ) { }

  async onModuleInit() {
    this.cacheUtxos("45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b_0", {
      "minterAddr": "bc1pqw9ncs4sna0ndh85ux5dhh9swueyjql23t4em8j0smywkqsngfmsn7gmua",
      "tokenAddr": "bc1plhz9wf0desgz8t32xm67vay9hgdmrnwzjzujgg0k9883cfxxgkzs20qfd5",
      "info": {
        // @ts-ignore
        "max": "21000000",
        "name": "cat",
        "limit": "5",
        "symbol": "CAT",
        "premine": "0",
        "decimals": 2,
        "minterMd5": "21cbd2e538f2b6cc40ee180e174f1e25"
      },
      "tokenId": "45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b_0",
      "revealTxid": "9a3fcb5a8344f53f2ba580f7d488469346bff9efe7780fbbf8d3490e3a3a0cd7",
      "revealHeight": 6540,
      "genesisTxid": "45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b",
      "name": "cat",
      "symbol": "CAT",
      "decimals": 2,
      "minterPubKey": "038b3c42b09f5f36dcf4e1a8dbdcb077324903ea8aeb9d9e4f86c8eb02134277",
      "tokenPubKey": "fdc45725edcc1023ae2a36f5e67485ba1bb1cdc290b92421f629cf1c24c64585"
    })
  }

  private filterShitTx(utxo: TxOutEntity, metadata: TokenMetadata, limit: bigint): boolean {
    const minterP2TR = toP2tr(metadata.minterAddr);
    if (utxo.txid === metadata.revealTxid) {
      return false
    }

    const txHex = this.txMap[utxo.txid]

    const tx = new btc.Transaction(txHex);
    

    const witnesses = tx.inputs[0].getWitnesses();
    
    let s = tx.outputs[tx.outputs.length - 1].script.toHex()
    let k = 0
    for(let witnesse of witnesses) {
      if(witnesse.toString('hex') == s) {
        k++
      }
    }
    if(k == 3) {
      return true
    } else {
      console.log(utxo.txid)
    }
    
    const REMAININGSUPPLY_WITNESS_INDEX = 16;

    let newMinter = 0;

    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];
      if (output.script.toHex() === minterP2TR) {
        newMinter++;
      }
    }
    for (let i = 0; i < tx.inputs.length; i++) {
      const witnesses = tx.inputs[i].getWitnesses();

      if (witnesses.length > 2) {
        const lockingScriptBuffer = witnesses[witnesses.length - 2];
        const { p2tr } = script2P2TR(lockingScriptBuffer);
        if (p2tr === minterP2TR) {
          if (byteString2Int(
            witnesses[REMAININGSUPPLY_WITNESS_INDEX].toString('hex'),
          ) < limit) {
            return true
          }
        }
      }
    }

    return false;
  }

  private async cacheUtxos(tokenIdOrTokenAddr: string, metadata: TokenMetadata) {
    while (true) {
      // let maxNum = 
      //let offset = getRandomInt(count.count - 100000)
      let { count } = await this._getMinterUtxoCount(tokenIdOrTokenAddr)
      // let count = 10
      console.log(count)
      //const utxos = await this._queryMinterUtxos(
      const utxos = await this._queryMinterUtxos(
        tokenIdOrTokenAddr,
        0,
        count
      );
      let filteredUtxo = []
      let batchNum = 1000
      for(let i = 0; i < count; i+= batchNum) {
        let txIds = []
        for(let j = 0; j < Math.min(batchNum, count - i - 1); j++) {
          if(this.txMap[utxos.utxos[i + j].txid]) {
            continue
          }
          txIds.push(utxos.utxos[i + j].txid)
        }
        const res = await this.rpcService.getRawTransactions(txIds)
        for(let j = 0; j < res.data.length; j++) {
            this.txMap[txIds[j]] = res.data[j].result
        }
        console.log("batchIndex: " + i.toString())
      }
      console.log("正在过滤")
      
      
      for (let utxo of utxos.utxos) {
        if (!this.solvedTx[utxo.txid]) {
          this.solvedTx[utxo.txid] = this.filterShitTx(utxo, metadata, BigInt(500))
        }
        if(this.solvedTx[utxo.txid]) {
          continue
        }
        filteredUtxo.push(utxo)
      }
      console.log("过滤完成")
      let r = await this.tokenService.renderUtxos(filteredUtxo)
      console.log("cacheOk")
      this.cacheInfo[tokenIdOrTokenAddr] = { utxos: r, trackerBlockHeight: utxos.trackerBlockHeight }
      await sleep(1 * 1000)
    }
  }

  async getMinterUtxos(tokenIdOrTokenAddr: string,
    offset: number,
    limit: number) {
    // @ts-ignore
    offset = parseInt(offset)
    // @ts-ignore
    limit = parseInt(limit)
    let cacheInfo = this.cacheInfo[tokenIdOrTokenAddr]
    let result = []
    for (let i = 0; i < limit; i++) {
      result.push(cacheInfo.utxos[offset + i])
    }
    return {
      utxos: result,
      trackerBlockHeight: cacheInfo.trackerBlockHeight
    }
  }

  async getMinterUtxoCount(tokenIdOrTokenAddr: string) {
    return {
      count: this.cacheInfo[tokenIdOrTokenAddr].utxos.length,
      trackerBlockHeight: this.cacheInfo[tokenIdOrTokenAddr].trackerBlockHeight
    }
  }

  async _getMinterUtxos(
    tokenIdOrTokenAddr: string,
    offset: number,
    limit: number,
  ) {
    const utxos = await this._queryMinterUtxos(
      tokenIdOrTokenAddr,
      offset || Constants.QUERY_PAGING_DEFAULT_OFFSET,
      Math.min(
        limit || Constants.QUERY_PAGING_DEFAULT_LIMIT,
        Constants.QUERY_PAGING_MAX_LIMIT,
      ),
    );
    return {
      utxos: await this.tokenService.renderUtxos(utxos.utxos),
      trackerBlockHeight: utxos.trackerBlockHeight,
    };
  }

  async _getMinterUtxoCount(tokenIdOrTokenAddr: string) {
    const lastProcessedHeight =
      await this.blockService.getLastProcessedBlockHeight();
    const tokenInfo =
      await this.tokenService.getTokenInfoByTokenIdOrTokenAddress(
        tokenIdOrTokenAddr,
      );
    let utxos = 0;
    if (lastProcessedHeight !== null && tokenInfo?.minterPubKey) {
      utxos = await this.txOutRepository.count({
        where: {
          xOnlyPubKey: tokenInfo.minterPubKey,
          spendTxid: IsNull(),
          blockHeight: LessThanOrEqual(lastProcessedHeight),
        },
        order: { createdAt: 'ASC' }
      });
    }
    return { count: utxos, trackerBlockHeight: lastProcessedHeight };
  }

  async _queryMinterUtxos(
    tokenIdOrTokenAddr: string,
    offset: number = null,
    limit: number = null,
  ) {
    const lastProcessedHeight =
      await this.blockService.getLastProcessedBlockHeight();
    const tokenInfo =
      await this.tokenService.getTokenInfoByTokenIdOrTokenAddress(
        tokenIdOrTokenAddr,
      );
    let utxos = [];
    if (lastProcessedHeight !== null && tokenInfo?.minterPubKey) {
      utxos = await this.txOutRepository.find({
        where: {
          xOnlyPubKey: tokenInfo.minterPubKey,
          spendTxid: IsNull(),
          blockHeight: LessThanOrEqual(lastProcessedHeight),
        },
        order: { createdAt: 'ASC' },
        skip: offset,
        take: limit,
      });
    }
    return { utxos, trackerBlockHeight: lastProcessedHeight };
  }
}