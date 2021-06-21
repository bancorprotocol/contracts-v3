import { ethers } from 'hardhat';
import { Contract as OldContract, ContractFactory, Overrides as OldOverrides } from '@ethersproject/contracts';
import { Signer } from '@ethersproject/abstract-signer';

import {
    ERC20,
    ERC20Burnable,
    Owned,
    PoolToken,
    TestERC20Burnable,
    TestMathEx,
    TestReserveToken,
    TestSafeERC20Ex,
    TestStandardToken,
    TokenHolder,
    TokenHolder__factory
} from 'typechain';

// Replace the type of the last param of a function
type LastIndex<T extends readonly any[]> = ((...t: T) => void) extends (x: any, ...r: infer R) => void
    ? Exclude<keyof T, keyof R>
    : never;
type ReplaceLastParam<TParams extends readonly any[], TReplace> = {
    [K in keyof TParams]: K extends LastIndex<TParams> ? TReplace : TParams[K];
};
type ReplaceLast<F, TReplace> = F extends (...args: infer T) => infer R
    ? (...args: ReplaceLastParam<T, TReplace>) => R
    : never;

export type Overrides = OldOverrides & { from?: Signer };

export type ContractName = { __contractName__: string; alpha: string };
export type Contract = OldContract & ContractName;

const deployOrAttach = <C extends Contract, F extends ContractFactory>(contractName: string, passedSigner?: Signer) => {
    type ParamsTypes = ReplaceLast<F['deploy'], Overrides>;

    return {
        deploy: async (...args: Parameters<ParamsTypes>): Promise<C> => {
            let defaultSigner = passedSigner ? passedSigner : (await ethers.getSigners())[0];

            const deployParamLength = (await ethers.getContractFactory(contractName)).deploy.length;

            // If similar length, override the last param
            if (args.length != 0 && args.length === deployParamLength) {
                const overrides = args.pop() as Overrides;

                const contractFactory = await ethers.getContractFactory(
                    contractName,
                    overrides.from ? overrides.from : defaultSigner
                );
                delete overrides.from;

                const contract = (await contractFactory.deploy(...args, overrides)) as C;
                contract.__contractName__ = contractName;
                return contract;
            }
            const contract = (await (
                await ethers.getContractFactory(contractName, defaultSigner)
            ).deploy(...args)) as C;
            contract.__contractName__ = contractName;
            return contract;
        },
        attach: attachOnly<C>(contractName, passedSigner).attach
    };
};

const attachOnly = <C extends Contract>(contractName: string, passedSigner?: Signer) => {
    return {
        attach: async (address: string, signer?: Signer): Promise<C> => {
            let defaultSigner = passedSigner ? passedSigner : (await ethers.getSigners())[0];
            const contract = (await ethers.getContractAt(contractName, address, signer ? signer : defaultSigner)) as C;
            contract.__contractName__ = contractName;
            return contract;
        }
    };
};

const getDeployOrAttach = <C extends Contract>(contractName: string, signer?: Signer) => {
    type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
    const alpha = ethers.getContractFactory(contractName);

    return deployOrAttach<C, ThenArg<typeof alpha>>(contractName, signer);
};

const getContracts = (signer?: Signer) => {
    return {
        // Link every contract to a default signer
        connect: (signer: Signer) => getContracts(signer),

        ERC20: getDeployOrAttach<ERC20 & ContractName>('ERC20', signer),
        Owned: getDeployOrAttach<Owned & ContractName>('Owned', signer),
        PoolToken: getDeployOrAttach<PoolToken & ContractName>('PoolToken', signer),
        TestERC20Burnable: getDeployOrAttach<TestERC20Burnable & ContractName>('TestERC20Burnable', signer),
        TestMathEx: getDeployOrAttach<TestMathEx & ContractName>('TestMathEx', signer),
        TestReserveToken: getDeployOrAttach<TestReserveToken & ContractName>('TestReserveToken', signer),
        TestSafeERC20Ex: getDeployOrAttach<TestSafeERC20Ex & ContractName>('TestSafeERC20Ex', signer),
        TestStandardToken: getDeployOrAttach<TestStandardToken & ContractName>('TestStandardToken', signer),
        TokenHolder: deployOrAttach<TokenHolder & ContractName, TokenHolder__factory>('TokenHolder', signer)
    };
};

export default getContracts();
