import { ContractFactory, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { ABI } from 'hardhat-deploy/types';

export type AsyncReturnType<T extends (...args: any) => any> = T extends (...args: any) => Promise<infer U>
    ? U
    : T extends (...args: any) => infer U
    ? U
    : any;

export type Contract<F extends ContractFactory> = AsyncReturnType<F['deploy']>;

export interface ContractBuilder<F extends ContractFactory> {
    metadata: {
        contractName: string;
        abi: ABI;
        bytecode: string;
    };
    deploy(...args: Parameters<F['deploy']>): Promise<Contract<F>>;
    attach(address: string, signer?: Signer): Promise<Contract<F>>;
}

export type FactoryConstructor<F extends ContractFactory> = {
    new (signer?: Signer): F;
    abi: unknown;
    bytecode: string;
};

export const deployOrAttach = <F extends ContractFactory>(
    contractName: string,
    FactoryConstructor: FactoryConstructor<F>,
    initialSigner?: Signer
): ContractBuilder<F> => {
    return {
        metadata: {
            contractName,
            abi: FactoryConstructor.abi as ABI,
            bytecode: FactoryConstructor.bytecode
        },
        deploy: async (...args: Parameters<F['deploy']>): Promise<Contract<F>> => {
            const defaultSigner = initialSigner ?? (await ethers.getSigners())[0];

            return new FactoryConstructor(defaultSigner).deploy(...(args || [])) as Promise<Contract<F>>;
        },
        attach: attachOnly<F>(FactoryConstructor, initialSigner).attach
    };
};

export const attachOnly = <F extends ContractFactory>(
    FactoryConstructor: FactoryConstructor<F>,
    initialSigner?: Signer
) => {
    return {
        attach: async (address: string, signer?: Signer): Promise<Contract<F>> => {
            const defaultSigner = initialSigner ?? (await ethers.getSigners())[0];
            return new FactoryConstructor(signer ?? defaultSigner).attach(address) as Contract<F>;
        }
    };
};

export interface ArtifactData {
    abi: ABI;
    bytecode: string;
}
