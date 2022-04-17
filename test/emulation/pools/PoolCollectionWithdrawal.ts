import { BigNumber } from 'ethers';
import { MathEx } from '../utility/MathEx';
import { Constants } from '../utility/Common';

export const PoolCollectionWithdrawal = {
    calculateWithdrawalAmounts
};

interface Output {
    p: BigNumber;
    q: BigNumber;
    r: BigNumber;
    s: BigNumber;
    t: BigNumber;
    u: BigNumber;
    v: BigNumber;
};

const ZERO = Constants.ZERO;
const ONE = Constants.ONE;
const MAX_UINT128 = Constants.MAX_UINT128;
const M = Constants.PPM_RESOLUTION;

/**
 * @dev This library implements the mathematics behind base-token withdrawal.
 * It exposes a single function which takes the following input values:
 * `a` - BNT trading liquidity
 * `b` - base token trading liquidity
 * `c` - base token excess amount
 * `e` - base token staked amount
 * `w` - base token external protection vault balance
 * `m` - trading fee in PPM units
 * `n` - withdrawal fee in PPM units
 * `x` - base token withdrawal amount
 * And returns the following output values:
 * `p` - BNT amount to add to the trading liquidity and to the master vault
 * `q` - BNT amount to add to the protocol equity
 * `r` - base token amount to add to the trading liquidity
 * `s` - base token amount to transfer from the master vault to the provider
 * `t` - BNT amount to mint directly for the provider
 * `u` - base token amount to transfer from the external protection vault to the provider
 * `v` - base token amount to keep in the pool as a withdrawal fee
 * The following table depicts the actual formulae based on the current state of the system:
 * +-----------+---------------------------------------------------------+----------------------------------------------------------+
 * |           |                         Deficit                         |                       Surplus                            |
 * +-----------+---------------------------------------------------------+----------------------------------------------------------+
 * |           | p = a*x*(e*(1-n)-b-c)*(1-m)/(b*e-x*(e*(1-n)-b-c)*(1-m)) | p = -a*x*(b+c-e*(1-n))/(b*e*(1-m)+x*(b+c-e*(1-n))*(1-m)) |
 * |           | q = 0                                                   | q = 0                                                    |
 * |           | r = -x*(e*(1-n)-b-c)/e                                  | r = x*(b+c-e*(1-n))/e                                    |
 * | Arbitrage | s = x*(1-n)                                             | s = x*(1-n)                                              |
 * |           | t = 0                                                   | t = 0                                                    |
 * |           | u = 0                                                   | u = 0                                                    |
 * |           | v = x*n                                                 | v = x*n                                                  |
 * +-----------+---------------------------------------------------------+----------------------------------------------------------+
 * |           | p = -a*z/(b*e) where z = max(x*(1-n)*b-c*(e-x*(1-n)),0) | p = -a*z/b where z = max(x*(1-n)-c,0)                    |
 * |           | q = -a*z/(b*e) where z = max(x*(1-n)*b-c*(e-x*(1-n)),0) | q = -a*z/b where z = max(x*(1-n)-c,0)                    |
 * |           | r = -z/e       where z = max(x*(1-n)*b-c*(e-x*(1-n)),0) | r = -z     where z = max(x*(1-n)-c,0)                    |
 * | Default   | s = x*(1-n)*(b+c)/e                                     | s = x*(1-n)                                              |
 * |           | t = see function `externalProtection`                   | t = 0                                                    |
 * |           | u = see function `externalProtection`                   | u = 0                                                    |
 * |           | v = x*n                                                 | v = x*n                                                  |
 * +-----------+---------------------------------------------------------+----------------------------------------------------------+
 * |           | p = 0                                                   | p = 0                                                    |
 * |           | q = 0                                                   | q = 0                                                    |
 * |           | r = 0                                                   | r = 0                                                    |
 * | Bootstrap | s = x*(1-n)*c/e                                         | s = x*(1-n)                                              |
 * |           | t = see function `externalProtection`                   | t = 0                                                    |
 * |           | u = see function `externalProtection`                   | u = 0                                                    |
 * |           | v = x*n                                                 | v = x*n                                                  |
 * +-----------+---------------------------------------------------------+----------------------------------------------------------+
 * Note that for the sake of illustration, both `m` and `n` are assumed normalized (between 0 and 1).
 * During runtime, it is taken into account that they are given in PPM units (between 0 and 1000000).
 */

/**
 * @dev returns `p`, `q`, `r`, `s`, `t`, `u` and `v` according to the current state:
 * +-------------------+-----------------------------------------------------------+
 * | `e > (b+c)/(1-n)` | bootstrap deficit or default deficit or arbitrage deficit |
 * +-------------------+-----------------------------------------------------------+
 * | `e < (b+c)`       | bootstrap surplus or default surplus or arbitrage surplus |
 * +-------------------+-----------------------------------------------------------+
 * | otherwise         | bootstrap surplus or default surplus                      |
 * +-------------------+-----------------------------------------------------------+
 */
function calculateWithdrawalAmounts(
    a: BigNumber, // <= 2**128-1
    b: BigNumber, // <= 2**128-1
    c: BigNumber, // <= 2**128-1
    e: BigNumber, // <= 2**128-1
    w: BigNumber, // <= 2**128-1
    m: BigNumber, // <= M == 1000000
    n: BigNumber, // <= M == 1000000
    x: BigNumber /// <= e <= 2**128-1
) {
    // given the restrictions above, everything below can be declared `unchecked`

    if (
        a.gt(MAX_UINT128) ||
        b.gt(MAX_UINT128) ||
        c.gt(MAX_UINT128) ||
        e.gt(MAX_UINT128) ||
        w.gt(MAX_UINT128) ||
        m.gt(M) ||
        n.gt(M) ||
        x.gt(e)
    ) {
        throw new Error('PoolCollectionWithdrawalInputInvalid');
    }

    const output = {
        p: ZERO,
        q: ZERO,
        r: ZERO,
        s: ZERO,
        t: ZERO,
        u: ZERO,
        v: ZERO,
    }

    const y = x.mul(M.sub(n)).div(M);

    if (e.mul(M.sub(n)).div(M).gt(b.add(c))) {
        const f = e.mul(M.sub(n)).div(M).sub(b.add(c));
        const g = e.sub(b.add(c));
        if (isStable(b, c, e, x) && affordableDeficit(b, e, f, g, m, n, x)) {
            arbitrageDeficit(output, a, b, e, f, m, x, y);
        } else if (a.gt(0)) {
            defaultDeficit(output, a, b, c, e, y);
            externalProtection(output, a, b, e, g, y, w);
        } else {
            output.s = y.mul(c).div(e);
            externalProtection(output, a, b, e, g, y, w);
        }
    } else {
        const f = MathEx.subMax0(b.add(c), e);
        if (f.gt(0) && isStable(b, c, e, x) && affordableSurplus(b, e, f, m, n, x)) {
            arbitrageSurplus(output, a, b, e, f, m, n, x, y);
        } else if (a.gt(0)) {
            defaultSurplus(output, a, b, c, y);
        } else {
            output.s = y;
        }
    }

    output.v = x.sub(y);

    return output;
}

/**
 * @dev returns `x < e*c/(b+c)`
 */
function isStable(
    b: BigNumber, // <= 2**128-1
    c: BigNumber, // <= 2**128-1
    e: BigNumber, // <= 2**128-1
    x: BigNumber /// <= e <= 2**128-1
) {
    // given the restrictions above, everything below can be declared `unchecked`
    return b.mul(x).lt(c.mul(e.sub(x)));
}

/**
 * @dev returns `b*e*((e*(1-n)-b-c)*m+e*n) > (e*(1-n)-b-c)*x*(e-b-c)*(1-m)`
 */
function affordableDeficit(
    b: BigNumber, // <= 2**128-1
    e: BigNumber, // <= 2**128-1
    f: BigNumber, // == e*(1-n)-b-c <= e <= 2**128-1
    g: BigNumber, // == e-b-c <= e <= 2**128-1
    m: BigNumber, // <= M == 1000000
    n: BigNumber, // <= M == 1000000
    x: BigNumber /// <  e*c/(b+c) <= e <= 2**128-1
) {
    // given the restrictions above, everything below can be declared `unchecked`
    const lhs = b.mul(e).mul(f.mul(m).add(e.mul(n)));
    const rhs = f.mul(x).mul(g.mul(M.sub(m)));
    return lhs.gt(rhs);
}

/**
 * @dev returns `b*e*((b+c-e)*m+e*n) > (b+c-e)*x*(b+c-e*(1-n))*(1-m)`
 */
function affordableSurplus(
    b: BigNumber, // <= 2**128-1
    e: BigNumber, // <= 2**128-1
    f: BigNumber, // == b+c-e <= 2**129-2
    m: BigNumber, // <= M == 1000000
    n: BigNumber, // <= M == 1000000
    x: BigNumber /// <  e*c/(b+c) <= e <= 2**128-1
) {
    // given the restrictions above, everything below can be declared `unchecked`
    const lhs = b.mul(e).mul(f.mul(m).add(e.mul(n)).mul(M));
    const rhs = f.mul(x).mul(f.mul(M).add(e.mul(n)).mul(M.sub(m)));
    return lhs.gt(rhs); // `x < e*c/(b+c)` --> `f*x < e*c*(b+c-e)/(b+c) <= e*c <= 2**256-1`
}

/**
 * @dev returns:
 * `p = a*x*(e*(1-n)-b-c)*(1-m)/(b*e-x*(e*(1-n)-b-c)*(1-m))`
 * `q = 0`
 * `r = -x*(e*(1-n)-b-c)/e`
 * `s = x*(1-n)`
 */
function arbitrageDeficit(
    output: Output,
    a: BigNumber, // <= 2**128-1
    b: BigNumber, // <= 2**128-1
    e: BigNumber, // <= 2**128-1
    f: BigNumber, // == e*(1-n)-b-c <= e <= 2**128-1
    m: BigNumber, // <= M == 1000000
    x: BigNumber, // <= e <= 2**128-1
    y: BigNumber /// == x*(1-n) <= x <= e <= 2**128-1
) {
    // given the restrictions above, everything below can be declared `unchecked`
    const i = f.mul(M.sub(m));
    const j = mulSubMulDivF(b, e.mul(M), x, i, ONE);
    output.p = MathEx.mulDivF(a.mul(x), i, j);
    output.r = MathEx.mulDivF(x, f, e).mul(-1);
    output.s = y;
}

/**
 * @dev returns:
 * `p = -a*x*(b+c-e*(1-n))/(b*e*(1-m)+x*(b+c-e*(1-n))*(1-m))`
 * `q = 0`
 * `r = x*(b+c-e*(1-n))/e`
 * `s = x*(1-n)`
 */
function arbitrageSurplus(
    output: Output,
    a: BigNumber, // <= 2**128-1
    b: BigNumber, // <= 2**128-1
    e: BigNumber, // <= 2**128-1
    f: BigNumber, // == b+c-e <= 2**129-2
    m: BigNumber, // <= M == 1000000
    n: BigNumber, // <= M == 1000000
    x: BigNumber, // <= e <= 2**128-1
    y: BigNumber /// == x*(1-n) <= x <= e <= 2**128-1
) {
    // given the restrictions above, everything below can be declared `unchecked`
    const i = f.mul(M).add(e.mul(n));
    const j = mulAddMulDivF(b, e.mul(M.sub(m)), x, i.mul(M.sub(m)), M);
    output.p = MathEx.mulDivF(a.mul(x), i, j).mul(-1);
    output.r = MathEx.mulDivF(x, i, e.mul(M));
    output.s = y;
}

/**
 * @dev returns:
 * `p = -a*z/(b*e)` where `z = max(x*(1-n)*b-c*(e-x*(1-n)),0)`
 * `q = -a*z/(b*e)` where `z = max(x*(1-n)*b-c*(e-x*(1-n)),0)`
 * `r = -z/e` where `z = max(x*(1-n)*b-c*(e-x*(1-n)),0)`
 * `s = x*(1-n)*(b+c)/e`
 */
function defaultDeficit(
    output: Output,
    a: BigNumber, // <= 2**128-1
    b: BigNumber, // <= 2**128-1
    c: BigNumber, // <= 2**128-1
    e: BigNumber, // <= 2**128-1
    y: BigNumber /// == x*(1-n) <= x <= e <= 2**128-1
) {
    // given the restrictions above, everything below can be declared `unchecked`
    const z = MathEx.subMax0(y.mul(b), c.mul(e.sub(y)));
    output.p = MathEx.mulDivF(a, z, b.mul(e)).mul(-1);
    output.q = output.p;
    output.r = z.div(e).mul(-1);
    output.s = MathEx.mulDivF(y, b.add(c), e);
}

/**
 * @dev returns:
 * `p = -a*z/b` where `z = max(x*(1-n)-c,0)`
 * `q = -a*z/b` where `z = max(x*(1-n)-c,0)`
 * `r = -z` where `z = max(x*(1-n)-c,0)`
 * `s = x*(1-n)`
 */
function defaultSurplus(
    output: Output,
    a: BigNumber, // <= 2**128-1
    b: BigNumber, // <= 2**128-1
    c: BigNumber, // <= 2**128-1
    y: BigNumber /// == x*(1-n) <= x <= e <= 2**128-1
) {
    // given the restrictions above, everything below can be declared `unchecked`
    const z = MathEx.subMax0(y, c);
    output.p = MathEx.mulDivF(a, z, b).mul(-1);
    output.q = output.p;
    output.r = z.mul(-1);
    output.s = y;
}

/**
 * @dev returns `t` and `u` according to the current state:
 * +-----------------------+-------+---------------------------+-------------------+
 * | x*(1-n)*(e-b-c)/e > w | a > 0 | t                         | u                 |
 * +-----------------------+-------+---------------------------+-------------------+
 * | true                  | true  | a*(x*(1-n)*(e-b-c)/e-w)/b | w                 |
 * +-----------------------+-------+---------------------------+-------------------+
 * | true                  | false | 0                         | w                 |
 * +-----------------------+-------+---------------------------+-------------------+
 * | false                 | true  | 0                         | x*(1-n)*(e-b-c)/e |
 * +-----------------------+-------+---------------------------+-------------------+
 * | false                 | false | 0                         | x*(1-n)*(e-b-c)/e |
 * +-----------------------+-------+---------------------------+-------------------+
 */
function externalProtection(
    output: Output,
    a: BigNumber, // <= 2**128-1
    b: BigNumber, // <= 2**128-1
    e: BigNumber, // <= 2**128-1
    g: BigNumber, // == e-b-c <= e <= 2**128-1
    y: BigNumber, // == x*(1-n) <= x <= e <= 2**128-1
    w: BigNumber /// <= 2**128-1
) {
    // given the restrictions above, everything below can be declared `unchecked`
    const yg = y.mul(g);
    const we = w.mul(e);
    if (yg > we) {
        output.t = a.gt(0) ? MathEx.mulDivF(a, yg.sub(we), b.mul(e)) : ZERO;
        output.u = w;
    } else {
        output.t = ZERO;
        output.u = yg.div(e);
    }
}

/**
 * @dev returns `a*b+x*y/z`
 */
function mulAddMulDivF(
    a: BigNumber,
    b: BigNumber,
    x: BigNumber,
    y: BigNumber,
    z: BigNumber
) {
    return a.mul(b).add(MathEx.mulDivF(x, y, z));
}

/**
 * @dev returns `a*b-x*y/z`
 */
function mulSubMulDivF(
    a: BigNumber,
    b: BigNumber,
    x: BigNumber,
    y: BigNumber,
    z: BigNumber
) {
    return a.mul(b).sub(MathEx.mulDivF(x, y, z));
}
