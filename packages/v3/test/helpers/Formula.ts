import Decimal from 'decimal.js';
import { MAX_UINT256, PPM_RESOLUTION } from './Constants';

const MAX_VAL = MAX_UINT256.toString();
const PPMR = PPM_RESOLUTION.toNumber();

const Action = {
    none: 0,
    burn: 1,
    mint: 2
};

const withdrawalAmounts = (a: any, b: any, c: any, d: any, e: any, m: any, n: any, x: any) => {
    [a, b, c, d, e, m, n, x] = [a, b, c, d, e, m, n, x].map((z) => new Decimal(z));
    let B = new Decimal(0);
    let C = new Decimal(0);
    let D = new Decimal(0);
    let E = new Decimal(0);
    let F = new Decimal(0);
    let G = new Decimal(0);
    let H = Action.none;
    const bPc = b.add(c);
    const eMx = e.mul(x);
    const bPcMd = bPc.mul(d);
    if (bPc.gte(e)) {
        // TKN is not in deficit
        B = eMx.div(d).floor();
        D = b.mul(eMx).div(bPcMd).floor();
        E = c.mul(eMx).div(bPcMd).floor();
        F = a.mul(eMx).div(bPcMd).floor();
        if (maxArbComputable(b, c, e) && maxArbCondition(b, c, d, e, n, x)) {
            // the cost of the arbitrage method is not larger than the withdrawal fee
            const f = bPc.sub(e).mul(x.mul(n.sub(PPMR).neg())).div(d.mul(n)).floor();
            G = optArb(a.sub(F), b.sub(D), f, m);
            H = Action.burn;
        }
    } else if (bPcMd.gte(eMx)) {
        // TKN is in deficit, and the withdrawal is not larger than the total TKN in the vault
        B = eMx.div(d).floor();
        D = b.mul(eMx).div(bPcMd).floor();
        E = c.mul(eMx).div(bPcMd).floor();
        F = a.mul(eMx).div(bPcMd).floor();
        if (maxArbComputable(b, c, e) && maxArbCondition(b, c, d, e, n, x)) {
            // the cost of the arbitrage method is not larger than the withdrawal fee
            const f = e.sub(bPc).mul(x.mul(n.sub(PPMR).neg())).div(d.mul(n)).floor();
            G = optArb(a.sub(F), b.sub(D), f, m);
            H = Action.mint;
        }
    }
    else {
        // TKN is in deficit, and the withdrawal is larger than the total TKN in the vault
        const y = a.mul(e.sub(bPc));
        const bMd = b.mul(d);
        B = bPc.mul(x).div(d).floor();
        C = y.mul(x).div(bMd).floor();
        D = b.mul(x).div(d).floor();
        E = c.mul(x).div(d).floor();
        F = a.mul(x).div(d).floor();
    }
    return { B, C, D, E, F, G, H };
};

// c(c - e)^2 / b <= 2^256 - 1
const maxArbComputable = (b: any, c: any, e: any) => {
    [b, c, e] = [b, c, e].map((z) => new Decimal(z));
    return c.mul(c.sub(e).pow(2)).div(b).lte(MAX_VAL);
};

// bden(b + c) / (b^3 + b^2(3c - 2e) + b(e^2(n + 1) + c(3c - 4e)) + c(c - e)^2) >= x
const maxArbCondition = (b: any, c: any, d: any, e: any, n: any, x: any) => {
    [b, c, d, e, n, x] = [b, c, d, e, n, x].map((z) => new Decimal(z));
    return maxArb(b, c, d, e, n).gte(x);
};

// bden(b + c) / (b^3 + b^2(3c - 2e) + b(e^2(n + 1) + c(3c - 4e)) + c(c - e)^2)
const maxArb = (b: any, c: any, d: any, e: any, n: any) => {
    [b, c, d, e, n] = [b, c, d, e, n].map((z) => new Decimal(z));
    n = n.div(PPMR);
    return b
        .mul(d)
        .mul(e)
        .mul(n)
        .mul(b.add(c))
        .div(
            b
                .pow(3)
                .add(b.pow(2).mul(c.mul(3).sub(e.mul(2))))
                .add(
                    b.mul(
                        e
                            .pow(2)
                            .mul(n.add(1))
                            .add(c.mul(c.mul(3).sub(e.mul(4))))
                    )
                )
                .add(c.mul(c.sub(e).pow(2)))
        );
};

// af(b(2 - m) + f) / (b(b + mf))
const optArb = (a: any, b: any, f: any, m: any) => {
    [a, b, f, m] = [a, b, f, m].map((z) => new Decimal(z));
    m = m.div(PPMR);
    return a
        .mul(f)
        .mul(b.mul(m.sub(2).neg()).add(f))
        .div(b.mul(b.add(m.mul(f))))
        .floor();
};

export default {
    Decimal,
    MAX_VAL,
    PPMR,
    withdrawalAmounts,
    maxArbComputable,
    maxArbCondition,
    maxArb,
    optArb
};
