import Web3 from 'web3';
import EthUtls from './eth-utils';

// import genericTokenAbi from '../constants/erc20-abi';
import tachyonTokenInfo from '../contracts/tachyon-token-info';

import {
  ITokenBalanceArgs,
  ITokenTransferArgs,
  IProviderInfo,
  IProviderConfig,
  ITokenInfo,
  ICreateTokenArgs,
} from '../';
import { TransactionReceipt } from 'web3/types';

class ProviderController {
  private web3 = new Web3('');
  private privateKey = '';
  private infuraKey = '';
  private etherScanKey = '';
  private providerInfo: IProviderInfo = undefined;
  private tokenContract = new this.web3.eth.Contract(tachyonTokenInfo.abi);

  constructor() {
    this.getEthBalance = this.getEthBalance.bind(this);
    this.getBalance = this.getBalance.bind(this);
    this.getTokenBalance = this.getTokenBalance.bind(this);
    this.getTokenInfo = this.getTokenInfo.bind(this);
    this.sendToken = this.sendToken.bind(this);
    this.setProvider = this.setProvider.bind(this);
    this.createToken = this.createToken.bind(this);
  }

  public setPrivateKey(key) {
    this.privateKey = EthUtls.hexStringFull(key);
  }

  public async setupKey(config: IProviderConfig) {
    this.infuraKey = config.infuraKey;
    this.etherScanKey = config.etherScanKey;
    return true;
  }

  public async setProvider(providerInfo: IProviderInfo) {
    this.web3.setProvider(new Web3.providers.HttpProvider(`${providerInfo.url}/${this.infuraKey}`));
    this.tokenContract = new this.web3.eth.Contract(tachyonTokenInfo.abi);
    this.providerInfo = providerInfo;
    return providerInfo.url;
  }

  public async getCreateTokenFee(args: ICreateTokenArgs) {
    const utils: any = this.web3.utils;
    const priceConfig = args.price || '19';
    const callObject = this.tokenContract.deploy({
      data: tachyonTokenInfo.bytecode,
      arguments: ['', '', 18, '', ''],
    });
    const gas = (await callObject.estimateGas()) + 15000;
    const gasPrice = parseFloat(utils.fromWei(utils.toWei(priceConfig, 'gwei'), 'ether'));
    return gasPrice * gas;
  }

  public async createToken(args: ICreateTokenArgs) {
    const utils: any = this.web3.utils;
    const priceConfig = args.price || '19';
    const totalSupply = EthUtls.toBigNumber(args.totalSupply || '0', args.decimals);
    const wallet = this.web3.eth.accounts.privateKeyToAccount(EthUtls.hexStringFull(this.privateKey));
    const callObject = this.tokenContract.deploy({
      data: tachyonTokenInfo.bytecode,
      arguments: [args.name, args.symbol, args.decimals || 18, args.icon || '', utils.toHex(totalSupply)],
    });
    const count = await this.web3.eth.getTransactionCount(wallet.address);
    const gas = await callObject.estimateGas();
    const rawTx = {
      from: wallet.address,
      gasPrice: utils.toWei(priceConfig, 'gwei'),
      gas: utils.toHex(gas + 15000),
      nonce: utils.toHex(count),
      data: callObject.encodeABI(),
    };

    // Check if current balance is enough to send a tx
    const gasPrice = parseFloat(utils.fromWei(utils.toWei(priceConfig, 'gwei'), 'ether'));
    const currentBalance = await this.getEthBalance(wallet.address);
    if (parseFloat(currentBalance.balance) < gasPrice * gas) {
      throw new Error('balance_not_enough');
    }

    const signedData: any = await this.web3.eth.accounts.signTransaction(rawTx, this.privateKey);
    const result = await this.sendSignTx(signedData.rawTransaction, false);
    return  typeof result === 'string' ? result : result.contractAddress;
  }

  public setDefaultAccount(address:string) {
    if (this.web3.utils.isAddress(address)) {
      return false;
    } else {
      this.web3.eth.defaultAccount = address;
      return true;
    }
  }

  public async getTokenInfo(contractAddr:string): Promise<ITokenInfo> {
    this.tokenContract.options.address = contractAddr;
    const name: string = await this.tokenContract.methods.name().call();
    const symbol: string = await this.tokenContract.methods.symbol().call();
    const decimals: string = await this.tokenContract.methods.decimals().call();
    let icon: string = '';
    try {
      icon = await this.tokenContract.methods.icon().call();
      if (typeof icon === 'string' && icon.length) {
        icon = `https://ipfs.infura.io/ipfs/${icon}`;
        // icon = await FileController.downloadFile(iconUrl, `${symbol}.png`);
      }
    } catch (err) {
      icon = '';
    }
    return { name, symbol, decimals: parseInt(decimals), icon, address: contractAddr };
  }

  public async validateErc20Contract(contractAddr: string) {
    try {
      this.tokenContract.options.address = contractAddr;
      const name = await this.tokenContract.methods.name().call();
      return typeof name === 'string' && name.length > 0;
    } catch (err) {
      return false;
    }
  }

  public getBalance(contractAddr:string, decimals: number) {
    return this.getTokenBalance({accountAddr:this.web3.eth.defaultAccount, tokenAddr:contractAddr, tokenDecimals:decimals});
  }

  public async getTokenBalance(args:ITokenBalanceArgs) {
    if (!args.tokenAddr) {
      return this.getEthBalance(args.accountAddr);
    }
    const valid = await this.validateErc20Contract(args.tokenAddr);
    if (!valid) {
      return {
        accountAddr: args.accountAddr,
        tokenAddr: args.tokenAddr,
        balance: 0,
      };
    }

    this.tokenContract.options.address = args.tokenAddr;
    const accountAddr = EthUtls.hexStringFull(args.accountAddr);
    const result = await this.tokenContract.methods.balanceOf(accountAddr).call();
    let balance = EthUtls.convertBigNumber(result.toString(), args.tokenDecimals);
    return {
      accountAddr: args.accountAddr,
      tokenAddr: args.tokenAddr,
      balance: balance,
    };
  }

  public async sendToken(args:ITokenTransferArgs, needConfirm = false) {
    const utils: any = this.web3.utils;
    args.senderAddr = EthUtls.hexStringFull(args.senderAddr);
    args.receiverAddr = EthUtls.hexStringFull(args.receiverAddr);
    if (!args.tokenInfo.address) {
      return this.sendEth(args, needConfirm);
    }
    this.tokenContract.options.address = args.tokenInfo.address;
    const count = await this.web3.eth.getTransactionCount(args.senderAddr);
    const amount = EthUtls.toWei(args.amount, args.tokenInfo.decimals);
    const data = this.tokenContract.methods.transfer(args.receiverAddr, amount).encodeABI();
    const rawTx = {
      from:args.senderAddr,
      gasPrice: EthUtls.toWei((args.gasPrice || 21).toString(), 9), //gwei
      to: EthUtls.hexStringFull(args.tokenInfo.address),
      gas: '0x00',
      nonce: this.web3.utils.toHex(count),
      data: data,
    };
    const gas = await this.web3.eth.estimateGas(rawTx);

    // Check if current balance is enough to send a tx
    const gasPrice = parseFloat(utils.fromWei(utils.toWei((args.gasPrice || 21).toString(), 'gwei'), 'ether'));
    const currentBalance = await this.getEthBalance(args.senderAddr);
    if (parseFloat(currentBalance.balance) < gasPrice * gas) {
      throw new Error('balance_not_enough');
    }

    rawTx.gas = this.web3.utils.toHex(gas);
    const signedData: any = await this.web3.eth.accounts.signTransaction(rawTx, this.privateKey);
    const result = await this.sendSignTx(signedData.rawTransaction, true);
    return result;
  }

  private sendSignTx(tx, useCallback): Promise<string | TransactionReceipt> {
    return new Promise((done, fail) => {
      if (useCallback) {
        this.web3.eth.sendSignedTransaction(tx, (err, result) => {
          if (err) {
            fail(err);
          } else {
            done(result);
          }
        });
      } else {
        // Not supported yet
        this.web3.eth.sendSignedTransaction(tx)
        .then(result => {
          console.log(result);
          done(result);
        })
        .catch(fail);
      }
    });
  }

  public async sendEth(args:ITokenTransferArgs, needConfirm = false) {
    const count = await this.web3.eth.getTransactionCount(args.senderAddr);
    const utils: any = this.web3.utils;
    const amount = EthUtls.toWei(args.amount, 18); // ether
    let rawTx = {
      from: args.senderAddr,
      to: args.receiverAddr,
      value: amount,
      gasPrice: EthUtls.toWei((args.gasPrice || 21).toString(), 9), // gwei
      gas: '',
      nonce: this.web3.utils.toHex(count),
    };
    const gas = await this.web3.eth.estimateGas(rawTx);

    // Check if current balance is enough to send a tx
    const gasPrice = parseFloat(utils.fromWei(utils.toWei((args.gasPrice || 21).toString(), 'gwei'), 'ether'));
    const currentBalance = await this.getEthBalance(args.senderAddr);
    if (parseFloat(currentBalance.balance) < gasPrice * gas + parseFloat(args.amount)) {
      throw new Error('balance_not_enough');
    }

    rawTx.gas = this.web3.utils.toHex(gas);
    const signedData: any = await this.web3.eth.accounts.signTransaction(rawTx, this.privateKey);
    const result = await this.sendSignTx(signedData.rawTransaction, true);
    return result;
  }

  public getErc20Transaction(address: string, tokenAddress: string) {
    let convertedAddress = EthUtls.hexStringSort(address);
    convertedAddress = '0x' + EthUtls.padLeft(convertedAddress, 64);
    // tslint:disable-next-line
    let apiReceive = `${this.providerInfo.api}?module=logs&action=getLogs&address=${tokenAddress}&topic2=${convertedAddress}&apikey=${this.etherScanKey}&fromBlock=0&toBlock=latest`;
    // tslint:disable-next-line
    let apiSend = `${this.providerInfo.api}?module=logs&action=getLogs&address=${tokenAddress}&topic1=${convertedAddress}&apikey=${this.etherScanKey}&fromBlock=0&toBlock=latest`;

    let promiseSend = fetch(apiSend)
    .then(response => response.json())
    .then(response => this.formatErc20Result(response));

    let promiseReceive = fetch(apiReceive)
    .then(response => response.json())
    .then(response => this.formatErc20Result(response));

    return Promise.all([promiseSend, promiseReceive]).then(values => {
      return {
        result: values[0].result.concat(values[1].result),
        message: values[0].message == 'OK' && values[1].message == 'OK' ? 'OK' : 'NOTOK',
        status: (parseInt(values[0].status) || parseInt(values[1].status)).toString(),
      };
    });
  }

  private formatErc20Result(response) {
    const decodedLogs = EthUtls.decodeLogs(response.result);
    response.result = response.result
    .map((item, index) => {
      if (!decodedLogs || index >= decodedLogs.length || !decodedLogs[index] || !decodedLogs[index].events) {
        return null;
      }
      const events: {name: string, type: string, value: string}[] = decodedLogs[index].events;
      if (events.length < 3) {
        // Not a standard erc20 transaction => not supported
        return null;
      }
      return {
        blockNumber: parseInt(item.blockNumber),
        timeStamp: parseInt(item.timeStamp),
        hash: item.transactionHash,
        nonce: null,
        blockHash: null,
        transactionIndex: parseInt(item.transactionIndex),
        from: events[0].value,
        to: events[1].value,
        value: events[2].value,
        gas: null,
        gasPrice: parseInt(item.gasPrice),
        isError: null,
        txreceipt_status: null,
        input: item.data,
        contractAddress: null,
        cumulativeGasUsed: null,
        gasUsed: parseInt(item.gasUsed),
        confirmations: null
      };
    })
    .filter(item => item);

    return response;
  }

  public getTransactions(address: string) {
    return this.getModuleInfo('account', 'txlist', 'address', EthUtls.hexStringFull(address), true);
  }

  public getTransactionDetail(txHash: string) {
    return this.getModuleInfo('transaction', 'getstatus', 'txhash', EthUtls.hexStringFull(txHash));
  }

  public getTransactionDetailUrl(txHash: string) {
    return this.providerInfo.scanner ? `${this.providerInfo.scanner}/tx/${txHash}` : undefined;
  }

  public getModuleInfo(module: string, action: string, key: string, value: string, list?: boolean) {
    let api = `${this.providerInfo.api}?module=${module}&action=${action}&${key}=${value}&apikey=${this.etherScanKey}`;
    if (list) {
      api = api + '&startblock=0&endblock=99999999';
    } else {
      api = api + '&tag=latest';
    }
    return fetch(api).then(response => response.json());
  }

  private async getEthBalance(accountAddr:string) {
    const result = await this.web3.eth.getBalance(accountAddr);
    let balance = EthUtls.convertBigNumber(result.toString(), 18);
    return {
      accountAddr: accountAddr,
      tokenAddr: undefined,
      balance: balance,
    };
  }
}

export default new ProviderController();
