import { Injectable, OnModuleInit } from '@nestjs/common';
import { TokenService } from '../token/token.service';
import { InjectRepository } from '@nestjs/typeorm';
import { TxOutEntity } from '../../entities/txOut.entity';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { Constants } from '../../common/constants';
import { BlockService } from '../../services/block/block.service';
import { sleep } from '../../common/utils';

function getRandomInt(max: number) {
  return Math.floor(Math.random() * max);
}
@Injectable()
export class MinterService implements OnModuleInit {
  private cacheInfo = {}
  constructor(
    private readonly blockService: BlockService,
    private readonly tokenService: TokenService,
    @InjectRepository(TxOutEntity)
    private readonly txOutRepository: Repository<TxOutEntity>,
  ) {}

  async onModuleInit() {
    this.cacheUtxos("45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b_0")
  }

  private async cacheUtxos(tokenIdOrTokenAddr: string) {
    while(true) {
      let count = await this._getMinterUtxoCount(tokenIdOrTokenAddr)
      let maxNum = 10000
      let offset = getRandomInt(count.count - 10000)
      let r = await this._getMinterUtxos(tokenIdOrTokenAddr,  offset, maxNum)
      
      console.log("cacheOk")
      this.cacheInfo[tokenIdOrTokenAddr] = r
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
      for(let i = 0; i < limit; i++) {
        result.push(cacheInfo.utxos[i])
      }
      return {
        utxos: result,
        trackerBlockHeight: cacheInfo.trackerBlockHeight
      }
  }

  async getMinterUtxoCount(tokenIdOrTokenAddr: string) {
    return this.cacheInfo[tokenIdOrTokenAddr].utxos.length
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
