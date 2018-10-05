import Web3 from 'web3';

import { ITokenInfo } from '../';
import erc20Abi from '../contracts/erc20-abi';
import { unknownBalance } from '../';

class EthUtls {
  private web3 = new Web3('');
  private abiDecoder;
  private negative1 = this.web3.utils.toBN(-1);

  public privateKeyToAccount(privateKey) {
    const account = this.web3.eth.accounts.privateKeyToAccount(this.hexStringFull(privateKey));
    return account;
  }

  public isAddress(address: string) {
    return this.web3.utils.isAddress(this.hexStringFull(address));
  }

  public numberToString(number, settingDecimals, tokenDecimals?): string {
    if (typeof tokenDecimals !== 'number') {
      tokenDecimals = 18; // default decimals
    }
    let decimals = settingDecimals >= tokenDecimals ? tokenDecimals : settingDecimals;

    if (number === undefined) {
      return unknownBalance;
    } else if (Math.abs(number) < 0.000001) {
      number = 0;
    }
    let result = number + '';
    let dot = result.indexOf('.');
    if (dot < 0) {
      result = result + this.padRight('.', decimals + 1);
    } else {
      result = result + this.padRight('', decimals + 1);
    }
    dot = result.indexOf('.');
    let left = result.substr(0, dot);
    let right = result.substr(dot + 1, decimals);
    if (parseFloat(`${left}.${right}`) === 0 && tokenDecimals > 0) {
      let temp = result.substring(dot + 1, result.length);
      let str = '';
      for (let i = 0; i < temp.length; i++) {
        str = str + temp[i];
        if (temp[i] != '0') {
          break;
        }
      }
      if (parseFloat(str)) {
        right = str;
      }
    }

    if (right.length && (decimals || (parseInt(left) === 0 && tokenDecimals > 0))) {
      right = '.' + right;
    }
    const stringValue = `${left}${right}`;
    const floatValue = parseFloat(stringValue);
    if (floatValue && stringValue.indexOf(floatValue.toString()) === -1) {
      return Number(floatValue).toExponential();
    } else {
      var parts = stringValue.toString().split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    }
  }

  public hexStringFull(hexStr:string) {
    return hexStr.indexOf('0x') === 0 ? hexStr : `0x${hexStr}`;
  }

  public hexStringSort(hexStr:string) {
    return hexStr.indexOf('0x') === 0 ? hexStr.substr(2) : hexStr;
  }

  public convertTokenBalance(token: ITokenInfo, balance: number) {
    if (token.address) {
      return 0; // TODO: convert other token balance to ETH unit
    } else {
      return balance;
    }
  }

  public convertBigNumber(number:string, decimals:number) {
    if (typeof decimals !== 'number') {
      decimals = 18; // default decimals
    }
    let balance = this.padLeft(number, decimals);
    let leftPart = balance.substr(0, balance.length - decimals);
    if (!leftPart.length) {
      leftPart = '0';
    }
    let rightPart = balance.substr(balance.length - decimals);
    balance = leftPart + '.' + rightPart;
    return balance;
  }

  public toBigNumber(number: string, decimals: number) {
    // Double convert to get the correct value from string
    // Ex: 00012 => 12
    let balance = this.web3.utils.numberToHex(number);
    balance = this.web3.utils.hexToNumberString(balance);
    return this.web3.utils.padRight(balance, decimals + balance.length, '0');
  }

  hexString2Array(str) {
    str = this.hexStringSort(str);
    var result = [];
    while (str.length >= 2) {
      result.push(parseInt(str.substring(0, 2), 16));
      str = str.substring(2, str.length);
    }

    return result;
  }

  hexArrayToString(arr) {
    let result = '';
    for (let i = 0; i < arr.length; i++) {
      const dec = arr[i];
      const hexStr = Number(dec).toString(16);
      const str = hexStr.length == 1 ? `0${hexStr}` : hexStr;
      result = result + str;
    }
    return result;
  }

  public decodeLogs(logs) {
    if (!this.abiDecoder) {
      this.abiDecoder = require('abi-decoder');
      this.abiDecoder.addABI(erc20Abi);
    }
    const result = this.abiDecoder.decodeLogs(logs);
    return result;
  }

  public async privateKeyToKeyStore(privateKey: string, password: string) {
    return await this.web3.eth.accounts.encrypt(privateKey, password);
  }

  public toWei(amount: string, decimals: number) {
    if (typeof decimals === 'string') {
      decimals = parseInt(decimals);
    }
    let ether = amount.toString();
    const base = this.getValueOfDecimals(decimals);
    const baseLength = decimals || 1;

    // Is it negative?
    const negative = ether.substring(0, 1) === '-'; // eslint-disable-line
    if (negative) {
      ether = ether.substring(1);
    }

    // Split it into a whole and fractional part
    const comps = ether.split('.'); // eslint-disable-line

    let whole: any = comps[0];
    let fraction: any = comps[1]; // eslint-disable-line

    if (!whole) {
      whole = '0';
    }
    if (!fraction) {
      fraction = '0';
    }
    if (fraction.length > baseLength) {
      fraction = fraction.substring(0, baseLength);
    }

    while (fraction.length < baseLength) {
      fraction += '0';
    }

    whole = new this.web3.utils.BN(whole);
    fraction = new this.web3.utils.BN(fraction);
    var wei = whole.mul(base).add(fraction); // eslint-disable-line

    if (negative) {
      wei = wei.mul(this.negative1);
    }

    return new this.web3.utils.BN(wei.toString(10), 10);
  }

  public isAddressEqual(addr1, addr2) {
    if (typeof addr1 === 'string' && typeof addr2 === 'string') {
      return this.hexStringFull(addr1).toLowerCase() === this.hexStringFull(addr2).toLowerCase();
    } else {
      return addr1 == addr2;
    }
  }

  public padLeft = (input: string, chars: number, sign?: string) => {
    return chars > input.length ? new Array(chars - input.length + 1).join(sign ? sign : '0') + input : input;
  }

  private padRight = (input: string, chars: number, sign?: string) => {
    return chars > input.length ? input + (new Array(chars - input.length + 1).join(sign ? sign : '0')) : input;
  }

  private getValueOfDecimals(decimals) {
    var unitValue = this.padRight('1', decimals + 1);

    return this.web3.utils.toBN(unitValue);
  }
}

export default new EthUtls();
