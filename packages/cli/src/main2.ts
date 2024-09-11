
import { MintCommand } from './commands/mint/mint.command'
import { resolveConfigPath } from './common';
import { ConfigService, SpendService, WalletService } from './providers'
const wallets = require('../wallet.json')

async function loop(mintCommand: MintCommand) {
    while(true) {
        try {
            await mintCommand.cat_cli_run(["5"], {
                id: "45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b_0"
            })
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
        let mintCommand = new MintCommand(spendService, walletService, configService)
        loop(mintCommand)
    }
    

}

main()