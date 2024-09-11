
import { MintCommand } from './commands/mint/mint.command'
import { BalanceCommand } from './commands/wallet/balance.command';
import { WalletCommand } from './commands/wallet/wallet.command';
import { resolveConfigPath } from './common';
import { ConfigService, SpendService, WalletService } from './providers'
const wallets = require('../wallet.json')
async function main() {

    let configService = new ConfigService()
    const error = configService.loadCliConfig('./config.json');

    if (error instanceof Error) {
      console.warn('WARNING:', error.message);
    }

    for(let wallet of wallets) {
        let walletService: WalletService = new WalletService(configService)
        walletService.setWallet(wallet)
        let balanceCommand = new BalanceCommand(walletService, configService)
        balanceCommand.cat_cli_run([], {
            id: "45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b_0"
        })
    }
    

}

main()