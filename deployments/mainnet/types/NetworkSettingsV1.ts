/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import {
  BaseContract,
  BigNumber,
  BigNumberish,
  BytesLike,
  CallOverrides,
  ContractTransaction,
  Overrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import { FunctionFragment, Result, EventFragment } from "@ethersproject/abi";
import { Listener, Provider } from "@ethersproject/providers";
import { TypedEventFilter, TypedEvent, TypedListener, OnEvent } from "./common";

export type VortexRewardsStruct = {
  burnRewardPPM: BigNumberish;
  burnRewardMaxAmount: BigNumberish;
};

export type VortexRewardsStructOutput = [number, BigNumber] & {
  burnRewardPPM: number;
  burnRewardMaxAmount: BigNumber;
};

export interface NetworkSettingsInterface extends utils.Interface {
  functions: {
    "DEFAULT_ADMIN_ROLE()": FunctionFragment;
    "addTokenToWhitelist(address)": FunctionFragment;
    "flashLoanFeePPM()": FunctionFragment;
    "getRoleAdmin(bytes32)": FunctionFragment;
    "getRoleMember(bytes32,uint256)": FunctionFragment;
    "getRoleMemberCount(bytes32)": FunctionFragment;
    "grantRole(bytes32,address)": FunctionFragment;
    "hasRole(bytes32,address)": FunctionFragment;
    "initialize()": FunctionFragment;
    "isTokenWhitelisted(address)": FunctionFragment;
    "minLiquidityForTrading()": FunctionFragment;
    "networkFeePPM()": FunctionFragment;
    "poolFundingLimit(address)": FunctionFragment;
    "postUpgrade(bytes)": FunctionFragment;
    "protectedTokenWhitelist()": FunctionFragment;
    "removeTokenFromWhitelist(address)": FunctionFragment;
    "renounceRole(bytes32,address)": FunctionFragment;
    "revokeRole(bytes32,address)": FunctionFragment;
    "roleAdmin()": FunctionFragment;
    "setFlashLoanFeePPM(uint32)": FunctionFragment;
    "setFundingLimit(address,uint256)": FunctionFragment;
    "setMinLiquidityForTrading(uint256)": FunctionFragment;
    "setNetworkFeePPM(uint32)": FunctionFragment;
    "setVortexRewards((uint32,uint256))": FunctionFragment;
    "setWithdrawalFeePPM(uint32)": FunctionFragment;
    "supportsInterface(bytes4)": FunctionFragment;
    "version()": FunctionFragment;
    "vortexRewards()": FunctionFragment;
    "withdrawalFeePPM()": FunctionFragment;
  };

  encodeFunctionData(
    functionFragment: "DEFAULT_ADMIN_ROLE",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "addTokenToWhitelist",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "flashLoanFeePPM",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "getRoleAdmin",
    values: [BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "getRoleMember",
    values: [BytesLike, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getRoleMemberCount",
    values: [BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "grantRole",
    values: [BytesLike, string]
  ): string;
  encodeFunctionData(
    functionFragment: "hasRole",
    values: [BytesLike, string]
  ): string;
  encodeFunctionData(
    functionFragment: "initialize",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "isTokenWhitelisted",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "minLiquidityForTrading",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "networkFeePPM",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "poolFundingLimit",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "postUpgrade",
    values: [BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "protectedTokenWhitelist",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "removeTokenFromWhitelist",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "renounceRole",
    values: [BytesLike, string]
  ): string;
  encodeFunctionData(
    functionFragment: "revokeRole",
    values: [BytesLike, string]
  ): string;
  encodeFunctionData(functionFragment: "roleAdmin", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "setFlashLoanFeePPM",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setFundingLimit",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setMinLiquidityForTrading",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setNetworkFeePPM",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setVortexRewards",
    values: [VortexRewardsStruct]
  ): string;
  encodeFunctionData(
    functionFragment: "setWithdrawalFeePPM",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "supportsInterface",
    values: [BytesLike]
  ): string;
  encodeFunctionData(functionFragment: "version", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "vortexRewards",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "withdrawalFeePPM",
    values?: undefined
  ): string;

  decodeFunctionResult(
    functionFragment: "DEFAULT_ADMIN_ROLE",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "addTokenToWhitelist",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "flashLoanFeePPM",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getRoleAdmin",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getRoleMember",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getRoleMemberCount",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "grantRole", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "hasRole", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "initialize", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "isTokenWhitelisted",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "minLiquidityForTrading",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "networkFeePPM",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "poolFundingLimit",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "postUpgrade",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "protectedTokenWhitelist",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "removeTokenFromWhitelist",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "renounceRole",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "revokeRole", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "roleAdmin", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "setFlashLoanFeePPM",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setFundingLimit",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setMinLiquidityForTrading",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setNetworkFeePPM",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setVortexRewards",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setWithdrawalFeePPM",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "supportsInterface",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "version", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "vortexRewards",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "withdrawalFeePPM",
    data: BytesLike
  ): Result;

  events: {
    "FlashLoanFeePPMUpdated(uint32,uint32)": EventFragment;
    "FundingLimitUpdated(address,uint256,uint256)": EventFragment;
    "MinLiquidityForTradingUpdated(uint256,uint256)": EventFragment;
    "NetworkFeePPMUpdated(uint32,uint32)": EventFragment;
    "RoleAdminChanged(bytes32,bytes32,bytes32)": EventFragment;
    "RoleGranted(bytes32,address,address)": EventFragment;
    "RoleRevoked(bytes32,address,address)": EventFragment;
    "TokenAddedToWhitelist(address)": EventFragment;
    "TokenRemovedFromWhitelist(address)": EventFragment;
    "VortexBurnRewardUpdated(uint32,uint32,uint256,uint256)": EventFragment;
    "WithdrawalFeePPMUpdated(uint32,uint32)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "FlashLoanFeePPMUpdated"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "FundingLimitUpdated"): EventFragment;
  getEvent(
    nameOrSignatureOrTopic: "MinLiquidityForTradingUpdated"
  ): EventFragment;
  getEvent(nameOrSignatureOrTopic: "NetworkFeePPMUpdated"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "RoleAdminChanged"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "RoleGranted"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "RoleRevoked"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "TokenAddedToWhitelist"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "TokenRemovedFromWhitelist"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "VortexBurnRewardUpdated"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "WithdrawalFeePPMUpdated"): EventFragment;
}

export type FlashLoanFeePPMUpdatedEvent = TypedEvent<
  [number, number],
  { prevFeePPM: number; newFeePPM: number }
>;

export type FlashLoanFeePPMUpdatedEventFilter =
  TypedEventFilter<FlashLoanFeePPMUpdatedEvent>;

export type FundingLimitUpdatedEvent = TypedEvent<
  [string, BigNumber, BigNumber],
  { pool: string; prevLimit: BigNumber; newLimit: BigNumber }
>;

export type FundingLimitUpdatedEventFilter =
  TypedEventFilter<FundingLimitUpdatedEvent>;

export type MinLiquidityForTradingUpdatedEvent = TypedEvent<
  [BigNumber, BigNumber],
  { prevLiquidity: BigNumber; newLiquidity: BigNumber }
>;

export type MinLiquidityForTradingUpdatedEventFilter =
  TypedEventFilter<MinLiquidityForTradingUpdatedEvent>;

export type NetworkFeePPMUpdatedEvent = TypedEvent<
  [number, number],
  { prevFeePPM: number; newFeePPM: number }
>;

export type NetworkFeePPMUpdatedEventFilter =
  TypedEventFilter<NetworkFeePPMUpdatedEvent>;

export type RoleAdminChangedEvent = TypedEvent<
  [string, string, string],
  { role: string; previousAdminRole: string; newAdminRole: string }
>;

export type RoleAdminChangedEventFilter =
  TypedEventFilter<RoleAdminChangedEvent>;

export type RoleGrantedEvent = TypedEvent<
  [string, string, string],
  { role: string; account: string; sender: string }
>;

export type RoleGrantedEventFilter = TypedEventFilter<RoleGrantedEvent>;

export type RoleRevokedEvent = TypedEvent<
  [string, string, string],
  { role: string; account: string; sender: string }
>;

export type RoleRevokedEventFilter = TypedEventFilter<RoleRevokedEvent>;

export type TokenAddedToWhitelistEvent = TypedEvent<
  [string],
  { token: string }
>;

export type TokenAddedToWhitelistEventFilter =
  TypedEventFilter<TokenAddedToWhitelistEvent>;

export type TokenRemovedFromWhitelistEvent = TypedEvent<
  [string],
  { token: string }
>;

export type TokenRemovedFromWhitelistEventFilter =
  TypedEventFilter<TokenRemovedFromWhitelistEvent>;

export type VortexBurnRewardUpdatedEvent = TypedEvent<
  [number, number, BigNumber, BigNumber],
  {
    prevBurnRewardPPM: number;
    newBurnRewardPPM: number;
    prevBurnRewardMaxAmount: BigNumber;
    newBurnRewardMaxAmount: BigNumber;
  }
>;

export type VortexBurnRewardUpdatedEventFilter =
  TypedEventFilter<VortexBurnRewardUpdatedEvent>;

export type WithdrawalFeePPMUpdatedEvent = TypedEvent<
  [number, number],
  { prevFeePPM: number; newFeePPM: number }
>;

export type WithdrawalFeePPMUpdatedEventFilter =
  TypedEventFilter<WithdrawalFeePPMUpdatedEvent>;

export interface NetworkSettings extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: NetworkSettingsInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(
    eventFilter?: TypedEventFilter<TEvent>
  ): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(
    eventFilter: TypedEventFilter<TEvent>
  ): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    DEFAULT_ADMIN_ROLE(overrides?: CallOverrides): Promise<[string]>;

    addTokenToWhitelist(
      token: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    flashLoanFeePPM(overrides?: CallOverrides): Promise<[number]>;

    getRoleAdmin(role: BytesLike, overrides?: CallOverrides): Promise<[string]>;

    getRoleMember(
      role: BytesLike,
      index: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[string]>;

    getRoleMemberCount(
      role: BytesLike,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    grantRole(
      role: BytesLike,
      account: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    hasRole(
      role: BytesLike,
      account: string,
      overrides?: CallOverrides
    ): Promise<[boolean]>;

    initialize(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    isTokenWhitelisted(
      token: string,
      overrides?: CallOverrides
    ): Promise<[boolean]>;

    minLiquidityForTrading(overrides?: CallOverrides): Promise<[BigNumber]>;

    networkFeePPM(overrides?: CallOverrides): Promise<[number]>;

    poolFundingLimit(
      pool: string,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    postUpgrade(
      data: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    protectedTokenWhitelist(overrides?: CallOverrides): Promise<[string[]]>;

    removeTokenFromWhitelist(
      token: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    renounceRole(
      role: BytesLike,
      account: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    revokeRole(
      role: BytesLike,
      account: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    roleAdmin(overrides?: CallOverrides): Promise<[string]>;

    setFlashLoanFeePPM(
      newFlashLoanFeePPM: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    setFundingLimit(
      pool: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    setMinLiquidityForTrading(
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    setNetworkFeePPM(
      newNetworkFeePPM: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    setVortexRewards(
      rewards: VortexRewardsStruct,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    setWithdrawalFeePPM(
      newWithdrawalFeePPM: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<[boolean]>;

    version(overrides?: CallOverrides): Promise<[number]>;

    vortexRewards(
      overrides?: CallOverrides
    ): Promise<[VortexRewardsStructOutput]>;

    withdrawalFeePPM(overrides?: CallOverrides): Promise<[number]>;
  };

  DEFAULT_ADMIN_ROLE(overrides?: CallOverrides): Promise<string>;

  addTokenToWhitelist(
    token: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  flashLoanFeePPM(overrides?: CallOverrides): Promise<number>;

  getRoleAdmin(role: BytesLike, overrides?: CallOverrides): Promise<string>;

  getRoleMember(
    role: BytesLike,
    index: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  getRoleMemberCount(
    role: BytesLike,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  grantRole(
    role: BytesLike,
    account: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  hasRole(
    role: BytesLike,
    account: string,
    overrides?: CallOverrides
  ): Promise<boolean>;

  initialize(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  isTokenWhitelisted(
    token: string,
    overrides?: CallOverrides
  ): Promise<boolean>;

  minLiquidityForTrading(overrides?: CallOverrides): Promise<BigNumber>;

  networkFeePPM(overrides?: CallOverrides): Promise<number>;

  poolFundingLimit(pool: string, overrides?: CallOverrides): Promise<BigNumber>;

  postUpgrade(
    data: BytesLike,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  protectedTokenWhitelist(overrides?: CallOverrides): Promise<string[]>;

  removeTokenFromWhitelist(
    token: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  renounceRole(
    role: BytesLike,
    account: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  revokeRole(
    role: BytesLike,
    account: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  roleAdmin(overrides?: CallOverrides): Promise<string>;

  setFlashLoanFeePPM(
    newFlashLoanFeePPM: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  setFundingLimit(
    pool: string,
    amount: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  setMinLiquidityForTrading(
    amount: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  setNetworkFeePPM(
    newNetworkFeePPM: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  setVortexRewards(
    rewards: VortexRewardsStruct,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  setWithdrawalFeePPM(
    newWithdrawalFeePPM: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  supportsInterface(
    interfaceId: BytesLike,
    overrides?: CallOverrides
  ): Promise<boolean>;

  version(overrides?: CallOverrides): Promise<number>;

  vortexRewards(overrides?: CallOverrides): Promise<VortexRewardsStructOutput>;

  withdrawalFeePPM(overrides?: CallOverrides): Promise<number>;

  callStatic: {
    DEFAULT_ADMIN_ROLE(overrides?: CallOverrides): Promise<string>;

    addTokenToWhitelist(
      token: string,
      overrides?: CallOverrides
    ): Promise<void>;

    flashLoanFeePPM(overrides?: CallOverrides): Promise<number>;

    getRoleAdmin(role: BytesLike, overrides?: CallOverrides): Promise<string>;

    getRoleMember(
      role: BytesLike,
      index: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    getRoleMemberCount(
      role: BytesLike,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    grantRole(
      role: BytesLike,
      account: string,
      overrides?: CallOverrides
    ): Promise<void>;

    hasRole(
      role: BytesLike,
      account: string,
      overrides?: CallOverrides
    ): Promise<boolean>;

    initialize(overrides?: CallOverrides): Promise<void>;

    isTokenWhitelisted(
      token: string,
      overrides?: CallOverrides
    ): Promise<boolean>;

    minLiquidityForTrading(overrides?: CallOverrides): Promise<BigNumber>;

    networkFeePPM(overrides?: CallOverrides): Promise<number>;

    poolFundingLimit(
      pool: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    postUpgrade(data: BytesLike, overrides?: CallOverrides): Promise<void>;

    protectedTokenWhitelist(overrides?: CallOverrides): Promise<string[]>;

    removeTokenFromWhitelist(
      token: string,
      overrides?: CallOverrides
    ): Promise<void>;

    renounceRole(
      role: BytesLike,
      account: string,
      overrides?: CallOverrides
    ): Promise<void>;

    revokeRole(
      role: BytesLike,
      account: string,
      overrides?: CallOverrides
    ): Promise<void>;

    roleAdmin(overrides?: CallOverrides): Promise<string>;

    setFlashLoanFeePPM(
      newFlashLoanFeePPM: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    setFundingLimit(
      pool: string,
      amount: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    setMinLiquidityForTrading(
      amount: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    setNetworkFeePPM(
      newNetworkFeePPM: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    setVortexRewards(
      rewards: VortexRewardsStruct,
      overrides?: CallOverrides
    ): Promise<void>;

    setWithdrawalFeePPM(
      newWithdrawalFeePPM: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<boolean>;

    version(overrides?: CallOverrides): Promise<number>;

    vortexRewards(
      overrides?: CallOverrides
    ): Promise<VortexRewardsStructOutput>;

    withdrawalFeePPM(overrides?: CallOverrides): Promise<number>;
  };

  filters: {
    "FlashLoanFeePPMUpdated(uint32,uint32)"(
      prevFeePPM?: null,
      newFeePPM?: null
    ): FlashLoanFeePPMUpdatedEventFilter;
    FlashLoanFeePPMUpdated(
      prevFeePPM?: null,
      newFeePPM?: null
    ): FlashLoanFeePPMUpdatedEventFilter;

    "FundingLimitUpdated(address,uint256,uint256)"(
      pool?: string | null,
      prevLimit?: null,
      newLimit?: null
    ): FundingLimitUpdatedEventFilter;
    FundingLimitUpdated(
      pool?: string | null,
      prevLimit?: null,
      newLimit?: null
    ): FundingLimitUpdatedEventFilter;

    "MinLiquidityForTradingUpdated(uint256,uint256)"(
      prevLiquidity?: null,
      newLiquidity?: null
    ): MinLiquidityForTradingUpdatedEventFilter;
    MinLiquidityForTradingUpdated(
      prevLiquidity?: null,
      newLiquidity?: null
    ): MinLiquidityForTradingUpdatedEventFilter;

    "NetworkFeePPMUpdated(uint32,uint32)"(
      prevFeePPM?: null,
      newFeePPM?: null
    ): NetworkFeePPMUpdatedEventFilter;
    NetworkFeePPMUpdated(
      prevFeePPM?: null,
      newFeePPM?: null
    ): NetworkFeePPMUpdatedEventFilter;

    "RoleAdminChanged(bytes32,bytes32,bytes32)"(
      role?: BytesLike | null,
      previousAdminRole?: BytesLike | null,
      newAdminRole?: BytesLike | null
    ): RoleAdminChangedEventFilter;
    RoleAdminChanged(
      role?: BytesLike | null,
      previousAdminRole?: BytesLike | null,
      newAdminRole?: BytesLike | null
    ): RoleAdminChangedEventFilter;

    "RoleGranted(bytes32,address,address)"(
      role?: BytesLike | null,
      account?: string | null,
      sender?: string | null
    ): RoleGrantedEventFilter;
    RoleGranted(
      role?: BytesLike | null,
      account?: string | null,
      sender?: string | null
    ): RoleGrantedEventFilter;

    "RoleRevoked(bytes32,address,address)"(
      role?: BytesLike | null,
      account?: string | null,
      sender?: string | null
    ): RoleRevokedEventFilter;
    RoleRevoked(
      role?: BytesLike | null,
      account?: string | null,
      sender?: string | null
    ): RoleRevokedEventFilter;

    "TokenAddedToWhitelist(address)"(
      token?: string | null
    ): TokenAddedToWhitelistEventFilter;
    TokenAddedToWhitelist(
      token?: string | null
    ): TokenAddedToWhitelistEventFilter;

    "TokenRemovedFromWhitelist(address)"(
      token?: string | null
    ): TokenRemovedFromWhitelistEventFilter;
    TokenRemovedFromWhitelist(
      token?: string | null
    ): TokenRemovedFromWhitelistEventFilter;

    "VortexBurnRewardUpdated(uint32,uint32,uint256,uint256)"(
      prevBurnRewardPPM?: null,
      newBurnRewardPPM?: null,
      prevBurnRewardMaxAmount?: null,
      newBurnRewardMaxAmount?: null
    ): VortexBurnRewardUpdatedEventFilter;
    VortexBurnRewardUpdated(
      prevBurnRewardPPM?: null,
      newBurnRewardPPM?: null,
      prevBurnRewardMaxAmount?: null,
      newBurnRewardMaxAmount?: null
    ): VortexBurnRewardUpdatedEventFilter;

    "WithdrawalFeePPMUpdated(uint32,uint32)"(
      prevFeePPM?: null,
      newFeePPM?: null
    ): WithdrawalFeePPMUpdatedEventFilter;
    WithdrawalFeePPMUpdated(
      prevFeePPM?: null,
      newFeePPM?: null
    ): WithdrawalFeePPMUpdatedEventFilter;
  };

  estimateGas: {
    DEFAULT_ADMIN_ROLE(overrides?: CallOverrides): Promise<BigNumber>;

    addTokenToWhitelist(
      token: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    flashLoanFeePPM(overrides?: CallOverrides): Promise<BigNumber>;

    getRoleAdmin(
      role: BytesLike,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getRoleMember(
      role: BytesLike,
      index: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getRoleMemberCount(
      role: BytesLike,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    grantRole(
      role: BytesLike,
      account: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    hasRole(
      role: BytesLike,
      account: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    initialize(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    isTokenWhitelisted(
      token: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    minLiquidityForTrading(overrides?: CallOverrides): Promise<BigNumber>;

    networkFeePPM(overrides?: CallOverrides): Promise<BigNumber>;

    poolFundingLimit(
      pool: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    postUpgrade(
      data: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    protectedTokenWhitelist(overrides?: CallOverrides): Promise<BigNumber>;

    removeTokenFromWhitelist(
      token: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    renounceRole(
      role: BytesLike,
      account: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    revokeRole(
      role: BytesLike,
      account: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    roleAdmin(overrides?: CallOverrides): Promise<BigNumber>;

    setFlashLoanFeePPM(
      newFlashLoanFeePPM: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    setFundingLimit(
      pool: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    setMinLiquidityForTrading(
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    setNetworkFeePPM(
      newNetworkFeePPM: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    setVortexRewards(
      rewards: VortexRewardsStruct,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    setWithdrawalFeePPM(
      newWithdrawalFeePPM: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    version(overrides?: CallOverrides): Promise<BigNumber>;

    vortexRewards(overrides?: CallOverrides): Promise<BigNumber>;

    withdrawalFeePPM(overrides?: CallOverrides): Promise<BigNumber>;
  };

  populateTransaction: {
    DEFAULT_ADMIN_ROLE(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    addTokenToWhitelist(
      token: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    flashLoanFeePPM(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getRoleAdmin(
      role: BytesLike,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getRoleMember(
      role: BytesLike,
      index: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getRoleMemberCount(
      role: BytesLike,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    grantRole(
      role: BytesLike,
      account: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    hasRole(
      role: BytesLike,
      account: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    initialize(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    isTokenWhitelisted(
      token: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    minLiquidityForTrading(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    networkFeePPM(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    poolFundingLimit(
      pool: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    postUpgrade(
      data: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    protectedTokenWhitelist(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    removeTokenFromWhitelist(
      token: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    renounceRole(
      role: BytesLike,
      account: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    revokeRole(
      role: BytesLike,
      account: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    roleAdmin(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    setFlashLoanFeePPM(
      newFlashLoanFeePPM: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    setFundingLimit(
      pool: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    setMinLiquidityForTrading(
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    setNetworkFeePPM(
      newNetworkFeePPM: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    setVortexRewards(
      rewards: VortexRewardsStruct,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    setWithdrawalFeePPM(
      newWithdrawalFeePPM: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    version(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    vortexRewards(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    withdrawalFeePPM(overrides?: CallOverrides): Promise<PopulatedTransaction>;
  };
}