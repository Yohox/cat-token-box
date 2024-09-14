
import { MintCommand } from './commands/mint/mint.command'
import { SendCommand } from './commands/send/send.command';
import { BalanceCommand } from './commands/wallet/balance.command';
import { getBalance, resolveConfigPath } from './common';
import { ConfigService, SpendService, WalletService } from './providers'
const wallets = require('../wallet.json')

async function loop(sendCommand: SendCommand, balance: number) {
    while(true) {
        try {
            await sendCommand.cat_cli_run(["bc1pxeyqz87sdrfgqfpaagnjjtq23rcsxef2j08ad66urwzpcfnph3xskj0tqc", balance.toString()], 
                // @ts-ignore
            {
                id:"45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b_0",
            })
            break
        } catch(e) {
            console.error(e)
        }
    }
}

async function main() {

    let configService = new ConfigService()
    const error = configService.loadCliConfig('./config.json');

    if (error instanceof Error) {
      console.warn('WARNING:', error.message);
    }

    let spendService = new SpendService(configService)
    for(let wallet of wallets) {
        let walletService: WalletService = new WalletService(configService)
        walletService.setWallet(wallet)

        let balance = await getBalance(configService, {
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
           }, walletService.getAddress().toString())
        let sendCommand = new SendCommand(null, spendService, walletService, configService)
        let balanceX = Math.floor(parseInt(balance.confirmed.toString()) / 100)
        if(balanceX == 0) {
            continue
        }
        console.log(walletService.getAddress().toString() + ": " + balanceX)
        await loop(sendCommand, balanceX)
    }
    

}

main()