import { BigNumber } from 'ethers';

export const Constants = {
    ZERO: BigNumber.from(0),
    ONE: BigNumber.from(1),
    MAX_UINT128: BigNumber.from(2).pow(128).sub(1),
    MAX_UINT256: BigNumber.from(2).pow(256).sub(1),
    PPM_RESOLUTION: BigNumber.from(1_000_000)
};

export enum TokenType {
    BNT,
    TKN
};
