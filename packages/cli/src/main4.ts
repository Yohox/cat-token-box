
import { MintCommand } from './commands/mint/mint.command'
import { BalanceCommand } from './commands/wallet/balance.command';
import { WalletCommand } from './commands/wallet/wallet.command';
import { resolveConfigPath } from './common';
import { ConfigService, SpendService, WalletService } from './providers'
import * as bip39 from 'bip39'
const wallets = require('../wallet.json')
async function main() {
    let configService = new ConfigService()
    const error = configService.loadCliConfig('./config.json');
    if (error instanceof Error) {
        console.warn('WARNING:', error.message);
    }
    let spendService = new SpendService(configService)
    let wallets = []
    for (let i = 0; i < 3; i++) {
        wallets.push({
            accountPath: "m/44'/0'/0'/0/0",
            name: 'dsdss',
            mnemonic: bip39.generateMnemonic(),
        })
        let walletService: WalletService = new WalletService(configService)
        walletService.setWallet(wallets[wallets.length - 1])
        console.log(walletService.getAddress().toString())
        
    }
    console.log(JSON.stringify(wallets))


}

main()