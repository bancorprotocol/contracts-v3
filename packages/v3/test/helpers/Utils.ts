import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import Contracts from 'components/Contracts';
import { BaseContract, BigNumber, BigNumberish, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { TestERC20Token } from 'typechain';
import { NATIVE_TOKEN_ADDRESS } from './Constants';

export type TokenWithAddress = TestERC20Token | { address: string };

export const toAddress = (account: string | SignerWithAddress | BaseContract) =>
    typeof account === 'string' ? account : account.address;

export const getTransactionCost = async (res: ContractTransaction) => {
    const cumulativeGasUsed = (await res.wait()).cumulativeGasUsed;

    return BigNumber.from(res.gasPrice).mul(BigNumber.from(cumulativeGasUsed));
};

export const getBalance = async (token: TokenWithAddress, account: string | SignerWithAddress) => {
    const accountAddress = toAddress(account);
    const tokenAddress = token.address;
    if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
        return ethers.provider.getBalance(accountAddress);
    }
    return await (await Contracts.TestERC20Token.attach(tokenAddress)).balanceOf(accountAddress);
};

export const getBalances = async (tokens: TokenWithAddress[], account: string | SignerWithAddress) => {
    const balances: { [balance: string]: BigNumber } = {};
    for (const token of tokens) {
        balances[token.address] = await getBalance(token, account);
    }

    return balances;
};

export const transfer = async (
    sourceAccount: SignerWithAddress,
    token: TokenWithAddress,
    target: string | SignerWithAddress,
    amount: BigNumberish
) => {
    const targetAddress = toAddress(target);
    const tokenAddress = token.address;
    if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
        return await sourceAccount.sendTransaction({ to: targetAddress, value: amount });
    }
    return await (await Contracts.TestERC20Token.attach(tokenAddress))
        .connect(sourceAccount)
        .transfer(targetAddress, amount);
};
