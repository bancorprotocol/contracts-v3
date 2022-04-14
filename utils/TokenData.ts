import { defaults } from 'lodash';

export const DEFAULT_DECIMALS = 18;
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export enum TokenSymbol {
    ETH = 'ETH',
    BNT = 'BNT',
    vBNT = 'vBNT',
    bnBNT = 'bnBNT',
    TKN = 'TKN',
    TKN1 = 'TKN1',
    TKN2 = 'TKN2',
    TKN3 = 'TKN3',
    TKN4 = 'TKN4',
    TKN5 = 'TKN5',
    TKN6 = 'TKN6',
    TKN7 = 'TKN7'
}

interface Errors {
    exceedsAllowance?: string;
    exceedsBalance?: string;
    burnExceedsBalance?: string;
}

const DEFAULT_ERRORS: Errors = {
    exceedsAllowance: 'ERC20: insufficient allowance',
    exceedsBalance: 'ERC20: transfer amount exceeds balance',
    burnExceedsBalance: 'ERC20: burn amount exceeds balance'
};

const TOKEN_DATA = {
    [TokenSymbol.ETH]: {
        name: 'Ethereum',
        decimals: DEFAULT_DECIMALS,
        errors: {}
    },
    [TokenSymbol.BNT]: {
        name: 'Bancor Network Token',
        decimals: DEFAULT_DECIMALS,
        errors: {
            exceedsBalance: 'SafeERC20: low-level call failed'
        }
    },
    [TokenSymbol.vBNT]: {
        name: 'Bancor Governance Token',
        decimals: DEFAULT_DECIMALS,
        errors: {
            exceedsAllowance: 'ERR_UNDERFLOW',
            exceedsBalance: 'ERR_UNDERFLOW',
            burnExceedsBalance: 'ERR_UNDERFLOW'
        }
    },
    [TokenSymbol.bnBNT]: {
        name: 'Bancor BNT Pool Token',
        decimals: DEFAULT_DECIMALS,
        errors: DEFAULT_ERRORS
    },
    [TokenSymbol.TKN]: {
        name: 'Test Token',
        decimals: DEFAULT_DECIMALS,
        errors: DEFAULT_ERRORS
    },
    [TokenSymbol.TKN1]: {
        name: 'Test Token 1',
        decimals: DEFAULT_DECIMALS,
        errors: DEFAULT_ERRORS
    },
    [TokenSymbol.TKN2]: {
        name: 'Test Token 2',
        decimals: DEFAULT_DECIMALS,
        errors: DEFAULT_ERRORS
    },
    [TokenSymbol.TKN3]: {
        name: 'Test Token 3',
        decimals: DEFAULT_DECIMALS,
        errors: DEFAULT_ERRORS
    },
    [TokenSymbol.TKN4]: {
        name: 'Test Token 4',
        decimals: DEFAULT_DECIMALS,
        errors: DEFAULT_ERRORS
    },
    [TokenSymbol.TKN5]: {
        name: 'Test Token 5',
        decimals: DEFAULT_DECIMALS,
        errors: DEFAULT_ERRORS
    },
    [TokenSymbol.TKN6]: {
        name: 'Test Token 6',
        decimals: 4,
        errors: DEFAULT_ERRORS
    },
    [TokenSymbol.TKN7]: {
        name: 'Test Token 7',
        decimals: DEFAULT_DECIMALS,
        errors: DEFAULT_ERRORS
    }
};

export class TokenData {
    private readonly _symbol: TokenSymbol;
    private readonly _name: string;
    private readonly _decimals: number;
    private readonly _errors: Errors;

    constructor(symbol: TokenSymbol) {
        this._symbol = symbol;

        const { name, decimals, errors } = TOKEN_DATA[symbol];
        this._name = name;
        this._decimals = decimals;
        this._errors = errors;
    }

    name() {
        return this._name;
    }

    symbol() {
        return this._symbol;
    }

    decimals() {
        return this._decimals;
    }

    errors() {
        return defaults(this._errors, { exceedsAllowance: '', exceedsBalance: '', burnExceedsBalance: '' });
    }

    isDefaultDecimals() {
        return this._decimals === DEFAULT_DECIMALS;
    }

    isNative() {
        return this._symbol === TokenSymbol.ETH;
    }

    isBNT() {
        return this._symbol === TokenSymbol.BNT;
    }
}
