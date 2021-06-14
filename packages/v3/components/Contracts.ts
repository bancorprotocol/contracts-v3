import { ethers } from 'hardhat';
import { Contract as OldContract, ContractFactory, Overrides as OldOverrides } from '@ethersproject/contracts';
import { Signer } from '@ethersproject/abstract-signer';

import {
    ERC20,
    ERC20__factory,
    Owned,
    Owned__factory,
    TestMathEx,
    TestMathEx__factory,
    TestReserveToken,
    TestReserveToken__factory,
    TestSafeERC20Ex,
    TestSafeERC20Ex__factory,
    TestStandardToken,
    TestStandardToken__factory,
    TokenHolder,
    TokenHolder__factory
} from 'typechain';

// Replace type of the last param of a function
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
export type Contract = OldContract & { __contractName__: string };

const deployOrAttach = <C extends Contract, F extends ContractFactory>(
    deployParamLength: number,
    contractName: string,
    passedSigner?: Signer
) => {
    type ParamsTypes = ReplaceLast<F['deploy'], Overrides>;

    return {
        deploy: async (...args: Parameters<ParamsTypes>): Promise<C> => {
            let defaultSigner = passedSigner ? passedSigner : (await ethers.getSigners())[0];

            // If similar then last param is override
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

export type ContractTypes = Contract | Owned | TestReserveToken | TestSafeERC20Ex | TestStandardToken | TokenHolder;

type ContractName = { __contractName__: string };

const getContracts = (signer?: Signer) => {
    return {
        // Link every contract to a default signer
        connect: (signer: Signer) => getContracts(signer),

        ERC20: deployOrAttach<ERC20 & ContractName, ERC20__factory>(
            ERC20__factory.prototype.deploy.length,
            'ERC20',
            signer
        ),
        Owned: deployOrAttach<Owned & ContractName, Owned__factory>(
            Owned__factory.prototype.deploy.length,
            'Owned',
            signer
        ),
        TestMathEx: deployOrAttach<TestMathEx & ContractName, TestMathEx__factory>(
            TestMathEx__factory.prototype.deploy.length,
            'TestMathEx',
            signer
        ),
        TestReserveToken: deployOrAttach<TestReserveToken & ContractName, TestReserveToken__factory>(
            TestReserveToken__factory.prototype.deploy.length,
            'TestReserveToken',
            signer
        ),
        TestSafeERC20Ex: deployOrAttach<TestSafeERC20Ex & ContractName, TestSafeERC20Ex__factory>(
            TestSafeERC20Ex__factory.prototype.deploy.length,
            'TestSafeERC20Ex',
            signer
        ),
        TestStandardToken: deployOrAttach<TestStandardToken & ContractName, TestStandardToken__factory>(
            TestStandardToken__factory.prototype.deploy.length,
            'TestStandardToken',
            signer
        ),
        TokenHolder: deployOrAttach<TokenHolder & ContractName, TokenHolder__factory>(
            TokenHolder__factory.prototype.deploy.length,
            'TokenHolder',
            signer
        )
    };
};

export default getContracts();
