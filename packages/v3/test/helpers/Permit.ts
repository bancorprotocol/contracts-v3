import { TypedDataUtils, signTypedMessage } from 'eth-sig-util';
import { fromRpcSig } from 'ethereumjs-util';
import { BigNumber, Wallet } from 'ethers';
import { MAX_UINT256 } from 'test/helpers/Constants';

const VERSION = '1';
const HARDHAT_CHAIN_ID = 31337;
const PERMIT_TYPE: 'EIP712Domain' | 'Permit' = 'Permit';

const EIP712_DOMAIN = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' }
];

const PERMIT = [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
];

export const domainSeparator = (name: string, verifyingContract: string) => {
    return (
        '0x' +
        TypedDataUtils.hashStruct(
            'EIP712Domain',
            { name, version: VERSION, chainId: HARDHAT_CHAIN_ID, verifyingContract },
            { EIP712Domain: EIP712_DOMAIN }
        ).toString('hex')
    );
};

export const permitData = (
    name: string,
    verifyingContract: string,
    owner: string,
    spender: string,
    amount: BigNumber,
    nonce: BigNumber,
    deadline: BigNumber = MAX_UINT256
) => ({
    primaryType: PERMIT_TYPE,
    types: { EIP712Domain: EIP712_DOMAIN, Permit: PERMIT },
    domain: { name, version: VERSION, chainId: HARDHAT_CHAIN_ID, verifyingContract },
    message: { owner, spender, value: amount.toString(), nonce: nonce.toString(), deadline: deadline.toString() }
});

export const permitSignature = async (
    wallet: Wallet,
    name: string,
    verifyingContract: string,
    spender: string,
    amount: BigNumber,
    nonce: BigNumber,
    deadline: BigNumber
) => {
    const data = permitData(name, verifyingContract, await wallet.getAddress(), spender, amount, nonce, deadline);
    const signature = signTypedMessage(Buffer.from(wallet.privateKey.slice(2), 'hex'), { data });
    return fromRpcSig(signature);
};
