import * as Keychain from 'react-native-keychain';
import Wallet from 'ethereumjs-wallet';
const hdkey = require('ethereumjs-wallet/hdkey');
var bip39 = require('bip39');
const Buffer = require('buffer').Buffer;

import SettingModel from './setting-model';
import EthUtils from './eth-utils';

const KEY_WALLET_CREATED_COUNT = 'KEY_WALLET_CREATED_COUNT';
const KEY_WALLET_MNEMONIC_SEED = 'KEY_WALLET_MNEMONIC_SEED';

class WalletController {
  private walletGenerator;
  private generatedCount: number;

  public constructor() {
    this.getGeneratedCount = this.getGeneratedCount.bind(this);
    this.init = this.init.bind(this);
    this.createWallets = this.createWallets.bind(this);
    this.createWallet = this.createWallet.bind(this);
    this.importWalletFromPK = this.importWalletFromPK.bind(this);
    this.importMnemonic = this.importMnemonic.bind(this);
    this.exportMnemonic = this.exportMnemonic.bind(this);
  }

  public async init() {
    this.generatedCount = await this.getGeneratedCount();
    let mnemonic = await this.getMnemonic();
    if (!mnemonic || !mnemonic.length || !this.validateMnemonic(mnemonic)) {
      mnemonic = this.generateMnemonic();
      await this.setMnemonic(mnemonic);
    }
    var seedhex = bip39.mnemonicToSeedHex(mnemonic);
    var seed = new Buffer(seedhex, 'hex');

    this.walletGenerator = hdkey.fromMasterSeed(seed);

    return true;
  }

  public async importMnemonic(mnemonic) {
    if (!this.validateMnemonic(mnemonic)) {
      throw new Error('Invalid format');
    }

    await this.setMnemonic(mnemonic);
    await SettingModel.setItem(KEY_WALLET_CREATED_COUNT, '0');

    var seedhex = bip39.mnemonicToSeedHex(mnemonic);
    var seed = new Buffer(seedhex, 'hex');

    this.walletGenerator = hdkey.fromMasterSeed(seed);
    this.generatedCount = 0;

    return true;
  }

  public async exportMnemonic() {
    const mnemonic = await this.getMnemonic();
    return mnemonic;
  }

  public async createWallets(count: number) {
    const result = [];
    for (let i = 0; i < count; i++) {
      const wallet = await this.createWallet();
      result.push(wallet);
    }
    return result;
  }

  public async createWallet(currentWallets?: string[]) {
    const {wallet, index} = this.generateWallet(currentWallets);
    this.generatedCount = index + 1;

    const privateKey = EthUtils.hexArrayToString(wallet.getPrivateKey());
    const publicKey = EthUtils.hexArrayToString(wallet.getPublicKey());
    const address = EthUtils.hexArrayToString(wallet.getAddress());

    await SettingModel.setItem(KEY_WALLET_CREATED_COUNT, this.generatedCount.toString());
    return {privateKey, publicKey, address};
  }

  private generateWallet(currentWallets?: string[]) {
    let index = this.generatedCount;
    let address = '';
    let wallet = undefined;
    while (true) {
      // Generate
      wallet = this.walletGenerator.deriveChild(index).getWallet();
      address = EthUtils.hexArrayToString(wallet.getAddress());

      // Validate
      let valid = true;
      if (!currentWallets || !currentWallets.length) {
        break;
      } else {
        for (let i = 0; i < currentWallets.length; i++) {
          if (EthUtils.hexStringSort(currentWallets[i]).toLowerCase() === EthUtils.hexStringSort(address).toLowerCase()) {
            valid = false;
            break;
          }
        }
        if (!valid) {
          index++;
          continue;
        }
      }
      break;
    }
    return {wallet, index};
  }

  public saveWallet(walletName:string, address:string, password:string):Promise<any> {
    return Keychain.setInternetCredentials(address, walletName, password);
  }

  public importWalletFromPK(privateKey:string) {
    return new Promise((done, fail) => {
      try {
        const wallet = Wallet.fromPrivateKey(new Buffer(EthUtils.hexString2Array(privateKey)));
        const publicKey = EthUtils.hexArrayToString(wallet.getPublicKey());
        const address = EthUtils.hexArrayToString(wallet.getAddress());
        done({privateKey, publicKey, address});
      } catch (err) {
        fail(err);
      }
    });
  }

  public async getGeneratedCount() {
    const count = await SettingModel.getItem(KEY_WALLET_CREATED_COUNT);
    return count ? parseInt(count) : 0;
  }

  public async getWalletKey(address: string) {
    const walletInfo = await this.getWalletPassword(address);
    return walletInfo.password;
  }

  private generateMnemonic() {
    let mnemonic = bip39.generateMnemonic();
    while (true) {
      const words = mnemonic.split(' ');
      const uniqueWords = words.filter((word, index) => words.indexOf(word) == index);
      if (words.length == uniqueWords.length) {
        break;
      } else {
        mnemonic = bip39.generateMnemonic();
      }
    }
    return mnemonic;
  }

  private validateMnemonic(mnemonic) {
    if (!bip39.validateMnemonic(mnemonic)) {
      return false;
    }
    const words = mnemonic.split(' ');
    const uniqueWords = words.filter((word, index) => words.indexOf(word) == index);
    return words.length === uniqueWords.length;
  }

  public async getMnemonic() {
    try {
      const result = await Keychain.getGenericPassword(KEY_WALLET_MNEMONIC_SEED);
      if (typeof result === 'boolean') {
        return '';
      } else {
        return result.password;
      }
    } catch (err) {
      return '';
    }
  }

  private async setMnemonic(mnemonic) {
    const result = await Keychain.setGenericPassword('MNEMONIC', mnemonic, KEY_WALLET_MNEMONIC_SEED);
    return result;
  }

  private getWalletPassword(address:string): Promise<{password: string}> {
    return new Promise((done, fail) => {
      Keychain.getInternetCredentials(EthUtils.hexStringFull(address))
      .then(credentials => {
        if (!credentials || typeof credentials === 'boolean') {
          return Keychain.getInternetCredentials(EthUtils.hexStringSort(address));
        } else {
          return credentials;
        }
      })
      .then(credentials => {
        if (typeof credentials === 'boolean') {
          fail('Cannot get key');
        } else {
          done(credentials);
        }
      })
      .catch(err => fail(err));
    });
  }
}

export default new WalletController();
