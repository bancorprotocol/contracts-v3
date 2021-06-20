import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import Contracts from 'components/Contracts';
import { NATIVE_TOKEN_ADDRESS } from '../../../components/Constants';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

export const getBalance = async (token: string | { address: string }, wallet: string | SignerWithAddress) => {
    const walletAddress = typeof wallet === 'string' ? wallet : wallet.address;
    const tokenAddress = typeof token === 'string' ? token : token.address;
    if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
        return ethers.provider.getBalance(walletAddress);
    }
    return await (await Contracts.TestStandardToken.attach(tokenAddress)).balanceOf(walletAddress);
};

export const getBalances = async (tokenAddresses: string[], wallet: string | SignerWithAddress) => {
    const balances: { [balance: string]: BigNumber } = {};
    for (const tokenAddress of tokenAddresses) {
        balances[tokenAddress] = await getBalance(tokenAddress, wallet);
    }

    return balances;
};
