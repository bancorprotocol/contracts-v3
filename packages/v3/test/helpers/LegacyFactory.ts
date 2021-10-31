import LegacyContracts from '../../components/LegacyContracts';
import { ethers } from 'hardhat';

export const ROLE_OWNER = require('../../../v2/test/helpers/Constants').roles.ROLE_OWNER;

const {
    registry: { CONVERTER_FACTORY, CONVERTER_REGISTRY, CONVERTER_REGISTRY_DATA, BANCOR_NETWORK, NETWORK_SETTINGS }
} = require('../../../v2/test/helpers/Constants');

export const createLegacySystem = async () => {
    const deployer = (await ethers.getSigners())[0];

    const contractRegistry = await LegacyContracts.ContractRegistry.deploy();
    const converterRegistry = await LegacyContracts.ConverterRegistry.deploy(contractRegistry.address);
    const converterRegistryData = await LegacyContracts.ConverterRegistryData.deploy(contractRegistry.address);
    const legacyNetwork = await LegacyContracts.LegacyBancorNetwork.deploy(contractRegistry.address);
    const legacyNetworkSettings = await LegacyContracts.LegacyNetworkSettings.deploy(deployer.address, 0);
    const standardPoolConverterFactory = await LegacyContracts.TestStandardPoolConverterFactory.deploy();
    const converterFactory = await LegacyContracts.ConverterFactory.deploy();

    await converterFactory.registerTypedConverterFactory(standardPoolConverterFactory.address);

    await contractRegistry.registerAddress(CONVERTER_FACTORY, converterFactory.address);
    await contractRegistry.registerAddress(CONVERTER_REGISTRY, converterRegistry.address);
    await contractRegistry.registerAddress(CONVERTER_REGISTRY_DATA, converterRegistryData.address);
    await contractRegistry.registerAddress(BANCOR_NETWORK, legacyNetwork.address);
    await contractRegistry.registerAddress(NETWORK_SETTINGS, legacyNetworkSettings.address);

    return {
        converterFactory,
        contractRegistry,
        converterRegistry,
        converterRegistryData,
        legacyNetwork,
        legacyNetworkSettings,
        standardPoolConverterFactory
    };
};
