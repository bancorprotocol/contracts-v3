import Contracts from '../../components/Contracts';
import { TestERC20Token } from '../../typechain-types';
import { NATIVE_TOKEN_ADDRESS, Symbols, TokenNames } from '../../utils/Constants';
import { toWei } from '../../utils/Types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BaseContract, BigNumber, BigNumberish, ContractTransaction, Wallet } from 'ethers';
import { ethers, waffle } from 'hardhat';

export type Addressable = { address: string };

export type TokenWithAddress = TestERC20Token | Addressable;

export const toAddress = (account: string | SignerWithAddress | BaseContract) =>
    typeof account === 'string' ? account : account.address;

export const getTransactionGas = async (res: ContractTransaction) => {
    const receipt = await res.wait();

    return receipt.cumulativeGasUsed;
};

export const getTransactionCost = async (res: ContractTransaction) => {
    const receipt = await res.wait();

    return receipt.effectiveGasPrice.mul(await getTransactionGas(res));
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
    target: string | SignerWithAddress | BaseContract,
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

export const createWallet = async () => {
    // create a random wallet, connect it to a test provider, and fund it
    const wallet = Wallet.createRandom().connect(waffle.provider);
    const deployer = (await ethers.getSigners())[0];
    await deployer.sendTransaction({
        value: toWei(10_000_000),
        to: await wallet.getAddress()
    });

    return wallet;
};

export const createTokenBySymbol = async (
    symbol: string,
    totalSupply: BigNumberish = toWei(1_000_000_000),
    burnable = false
): Promise<TokenWithAddress> => {
    switch (symbol) {
        case Symbols.ETH:
            return { address: NATIVE_TOKEN_ADDRESS };

        case Symbols.TKN:
        case `${Symbols.TKN}1`:
        case `${Symbols.TKN}2`:
            return (burnable ? Contracts.TestERC20Burnable : Contracts.TestERC20Token).deploy(
                TokenNames.TKN,
                Symbols.TKN,
                totalSupply
            );

        default:
            throw new Error(`Unsupported type ${symbol}`);
    }
};

export const errorMessageTokenExceedsAllowance = (symbol: string): string => {
    switch (symbol) {
        case Symbols.BNT:
            return '';

        case Symbols.vBNT:
            return 'ERR_UNDERFLOW';

        case Symbols.TKN:
        case `${Symbols.TKN}1`:
        case `${Symbols.TKN}2`:
            return 'ERC20: transfer amount exceeds allowance';

        default:
            throw new Error(`Unsupported type ${symbol}`);
    }
};

export const errorMessageTokenExceedsBalance = (symbol: string): string => {
    switch (symbol) {
        case Symbols.BNT:
            return 'SafeERC20: low-level call failed';

        case Symbols.vBNT:
            return 'ERR_UNDERFLOW';

        case Symbols.ETH:
            return '';

        case Symbols.TKN:
        case `${Symbols.TKN}1`:
        case `${Symbols.TKN}2`:
            return 'ERC20: transfer amount exceeds balance';

        default:
            throw new Error(`Unsupported type ${symbol}`);
    }
};

export const errorMessageTokenBurnExceedsBalance = (symbol: string): string => {
    switch (symbol) {
        case Symbols.BNT:
            return '';

        case Symbols.vBNT:
            return 'ERR_UNDERFLOW';

        case Symbols.ETH:
            return '';

        case Symbols.TKN:
        case `${Symbols.TKN}1`:
        case `${Symbols.TKN}2`:
            return 'ERC20: burn amount exceeds balance';

        default:
            throw new Error(`Unsupported type ${symbol}`);
    }
};
