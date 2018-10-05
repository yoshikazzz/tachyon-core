import providerController from './src/provider-controller';
import walletController from './src/wallet-controller';
import utils from './src/eth-utils';

const controller = {
  providerController,
  walletController,
  utils,
};

export default controller;

export interface ITokenBalanceArgs {
  accountAddr: string;
  tokenAddr: string;
  tokenDecimals: number;
}

export interface ITokenTransferArgs {
  senderAddr: string;
  receiverAddr: string;
  tokenInfo: ITokenInfo;
  amount: string;
  gasPrice?: number;
  gasLimit?: number;
  data?: string;
}

export interface IProviderInfo {
  _id?: string;
  name: string;
  url: string;
  scanner?: string;
  api?: string;
  color: string;
}

export interface IProviderConfig {
  infuraKey: string;
  etherScanKey: string;
}

export interface ITokenInfo {
  name: string;
  symbol: string;
  decimals?: number;
  icon?: string;
  address: string;
}

export interface ICreateTokenArgs {
  name?: string;
  address?: string;
  symbol?: string;
  icon?: string;
  decimals?: number;
  totalSupply?: string;
  price?: string;
}

export const unknownBalance = '-';
