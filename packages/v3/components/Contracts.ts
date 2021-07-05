import { ethers } from 'hardhat';
import { Contract as OldContract, ContractFactory, Overrides as OldOverrides } from '@ethersproject/contracts';
import { Signer } from '@ethersproject/abstract-signer';

import {
    BancorVault__factory,
    NetworkSettings__factory,
    PoolToken__factory,
    TestERC20Burnable__factory,
    TestMathEx__factory,
    TestOwnedUpgradeable__factory,
    TestReserveToken__factory,
    TestSafeERC20Ex__factory,
    TestERC20Token__factory,
    TokenHolderUpgradeable__factory,
    TransparentUpgradeableProxy__factory
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

type AsyncReturnType<T extends (...args: any) => any> = T extends (...args: any) => Promise<infer U>
    ? U
    : T extends (...args: any) => infer U
    ? U
    : any;

export type Overrides = OldOverrides & { from?: Signer };

export type ContractName = { __contractName__: string };
export type Contract = OldContract & ContractName;

const deployOrAttach = <F extends ContractFactory>(contractName: string, passedSigner?: Signer) => {
    type ParamsTypes = ReplaceLast<F['deploy'], Overrides>;

    return {
        deploy: async (...args: Parameters<ParamsTypes>): Promise<AsyncReturnType<F['deploy']> & ContractName> => {
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

                const contract = (await contractFactory.deploy(...args, overrides)) as AsyncReturnType<F['deploy']> &
                    ContractName;
                contract.__contractName__ = contractName;
                return contract;
            }
            const contract = (await (
                await ethers.getContractFactory(contractName, defaultSigner)
            ).deploy(...args)) as AsyncReturnType<F['deploy']> & ContractName;
            contract.__contractName__ = contractName;
            return contract;
        },
        attach: attachOnly<F>(contractName, passedSigner).attach
    };
};

const attachOnly = <F extends ContractFactory>(contractName: string, passedSigner?: Signer) => {
    return {
        attach: async (address: string, signer?: Signer): Promise<AsyncReturnType<F['deploy']> & ContractName> => {
            let defaultSigner = passedSigner ? passedSigner : (await ethers.getSigners())[0];
            const contract = (await ethers.getContractAt(
                contractName,
                address,
                signer ? signer : defaultSigner
            )) as AsyncReturnType<F['deploy']> & ContractName;
            contract.__contractName__ = contractName;
            return contract;
        }
    };
};

const getContracts = (signer?: Signer) => {
    return {
        // Link every contract to a default signer
        connect: (signer: Signer) => getContracts(signer),

        BancorVault: deployOrAttach<BancorVault__factory>('BancorVault', signer),
        NetworkSettings: deployOrAttach<NetworkSettings__factory>('NetworkSettings', signer),
        PoolToken: deployOrAttach<PoolToken__factory>('PoolToken', signer),
        TestERC20Burnable: deployOrAttach<TestERC20Burnable__factory>('TestERC20Burnable', signer),
        TestMathEx: deployOrAttach<TestMathEx__factory>('TestMathEx', signer),
        TestOwnedUpgradeable: deployOrAttach<TestOwnedUpgradeable__factory>('TestOwnedUpgradeable', signer),
        TestReserveToken: deployOrAttach<TestReserveToken__factory>('TestReserveToken', signer),
        TestSafeERC20Ex: deployOrAttach<TestSafeERC20Ex__factory>('TestSafeERC20Ex', signer),
        TestERC20Token: deployOrAttach<TestERC20Token__factory>('TestERC20Token', signer),
        TokenHolderUpgradeable: deployOrAttach<TokenHolderUpgradeable__factory>('TokenHolderUpgradeable', signer),
        TransparentUpgradeableProxy: deployOrAttach<TransparentUpgradeableProxy__factory>(
            'TransparentUpgradeableProxy',
            signer
        )
    };
};

export default getContracts();
