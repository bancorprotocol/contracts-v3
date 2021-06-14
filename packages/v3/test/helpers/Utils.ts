import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import Contracts from 'components/Contracts';
import { NATIVE_TOKEN_ADDRESS } from './Constants';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

export const getBalance = async (wallet: string | SignerWithAddress, token?: string | { address: string }) => {
    const walletAddress = typeof wallet === 'string' ? wallet : wallet.address;
    if (token === undefined) {
        return ethers.provider.getBalance(walletAddress);
    }
    const tokenAddress = typeof token === 'string' ? token : token.address;
    if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
        return ethers.provider.getBalance(walletAddress);
    }
    return await (await Contracts.TestStandardToken.attach(tokenAddress)).balanceOf(walletAddress);
};

export const getBalances = async (wallet: string | SignerWithAddress, tokenAddresses: string[]) => {
    const balances: { [balance: string]: BigNumber } = {};
    for (const tokenAddress of tokenAddresses) {
        balances[tokenAddress] = await getBalance(wallet, tokenAddress);
    }

    return balances;
};
