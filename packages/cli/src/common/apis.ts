import { UTXO } from 'scrypt-ts';
import fetch from 'node-fetch-cjs';

import {
  rpc_broadcast,
  rpc_getconfirmations,
  rpc_getfeeRate,
  rpc_getrawtransaction,
  rpc_listunspent,
} from './apis-rpc';
import { logerror, logwarn } from './log';
import { btc } from './btc';
import { ConfigService, WalletService } from 'src/providers';
import axios from 'axios';
const proxyConfig = require('../proxy.json')
export const getFeeRate = async function (
  config: ConfigService,
  wallet: WalletService,
): Promise<number> {
  if (config.useRpc()) {
    const feeRate = await rpc_getfeeRate(config, wallet.getWalletName());
    if (feeRate instanceof Error) {
      return 2;
    }
    return feeRate;
  }

  const url = `${config.getApiHost()}/api/v1/fees/recommended`;
  const feeRate: any = await fetch(url, config.withProxy())
    .then((res) => {
      if (res.status === 200) {
        return res.json();
      }
      return {};
    })
    .catch((e) => {
      console.error(`fetch feeRate failed:`, e);
      return {};
    });

  if (!feeRate) {
    return 2;
  }

  return Math.max(2, feeRate['fastestFee'] || 1);
};

export const getFractalUtxos = async function (
  config: ConfigService,
  address: btc.Address,
): Promise<UTXO[]> {
  const script = new btc.Script(address).toHex();

  const url = `https://open-api-fractal-testnet.unisat.io/v1/indexer/address/${address}/utxo-data?cursor=0&size=16`;
  const utxos: Array<any> = await fetch(
    url,
    config.withProxy({
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.getApiKey()}`,
      },
    }),
  )
    .then(async (res) => {
      const contentType = res.headers.get('content-type');
      if (contentType.includes('json')) {
        return res.json();
      } else {
        throw new Error(
          `invalid http content type : ${contentType}, status: ${res.status}`,
        );
      }
    })
    .then((res: any) => {
      if (res.code === 0) {
        const { data } = res;
        return data.utxo.map((utxo) => {
          return {
            txId: utxo.txid,
            outputIndex: utxo.vout,
            script: utxo.scriptPk || script,
            satoshis: utxo.satoshi,
          };
        });
      } else {
        logerror(`fetch utxos failed:`, new Error(res.msg));
      }
      return [];
    })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .catch((e) => {
      logerror(`fetch utxos failed:`, e);
      return [];
    });
  return utxos.sort((a, b) => a.satoshi - b.satoshi);
};

export const getUtxos = async function (
  config: ConfigService,
  wallet: WalletService,
  address: btc.Address,
): Promise<UTXO[]> {
  // if (config.useRpc()) {
  //   const utxos = await rpc_listunspent(
  //     config,
  //     wallet.getWalletName(),
  //     address.toString(),
  //   );
  //   if (utxos instanceof Error) {
  //     return [];
  //   }
  //   return utxos;
  // }

  if (config.isFractalNetwork() && !config.useRpc()) {
    return getFractalUtxos(config, address);
  }

  const script = new btc.Script(address).toHex();
  while(true) {
    try {
      let resp = await axios.get(`${config.getApiHost()}/api/address/${address}/utxo`, {
        proxy: proxyConfig,
        timeout: 5 * 1000
      })
      let utxos = resp.data.map((utxo) => {
        return {
          txId: utxo.txid,
          outputIndex: utxo.vout,
          script: utxo.script || script,
          satoshis: utxo.value,
        };
      })
      return utxos.sort((a, b) => a.satoshi - b.satoshi);
    } catch(e) {
      console.log(`正在重试: ${config.getApiHost()}/api/address/${address}/utxo`)
    }
  }
};

export const getRawTransaction = async function (
  config: ConfigService,
  wallet: WalletService,
  txid: string,
): Promise<string | Error> {
  if (config.useRpc()) {
    return rpc_getrawtransaction(config, wallet.getWalletName(), txid);
  }
  const url = `${config.getApiHost()}/api/tx/${txid}/hex`;
  return (
    fetch(url, config.withProxy())
      .then((res) => {
        if (res.status === 200) {
          return res.text();
        }
        new Error(`invalid http response code: ${res.status}`);
      })
      .then((txhex: string) => {
        return txhex;
      })
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .catch((e: Error) => {
        logerror('getrawtransaction failed!', e);
        return e;
      })
  );
};

export const getConfirmations = async function (
  config: ConfigService,
  txid: string,
): Promise<
  | {
      blockhash: string;
      confirmations: number;
    }
  | Error
> {
  // if (config.useRpc()) {
  //   return rpc_getconfirmations(config, txid);
  // }
  while(true) {
    try {
      let resp = await axios.get(`${config.getApiHost()}/api/tx/${txid}/status`, {
        proxy: proxyConfig,
        timeout: 5 * 1000
      })
      return {
        blockhash: resp.data.block_hash,
        confirmations: resp.data.confirmed ? 1 : 0
      }
    } catch(e) {

      console.log(`正在重试: ${config.getApiHost()}/api/tx/${txid}/status`)
    }
  }
  // logwarn('No supported getconfirmations', new Error());
  // return {
  //   blockhash: '',
  //   confirmations: -1,
  // };
};

export async function broadcast(
  config: ConfigService,
  wallet: WalletService,
  txHex: string,
): Promise<string | Error> {
  if (config.useRpc()) {
    return rpc_broadcast(config, wallet.getWalletName(), txHex);
  }
  let tryCount = 10
  while(true) {
    try {
      let resp = await axios.post(`${config.getApiHost()}/api/tx`, txHex, {
        proxy: proxyConfig,
        // timeout: 20 * 1000,
        headers: {
          'Content-Type': 'text/plain'
        }
      })
      return resp.data
    } catch(e) {
      console.error(`正在重试: ${config.getApiHost()}/api/tx`)
      if(tryCount > 0) {
        tryCount --
        continue
      } else {
        throw e
      }
    }
  }
}
