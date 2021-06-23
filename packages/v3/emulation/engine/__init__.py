MIN = 0
MAX = 2 ** 256 - 1
PPM = 1000000
TKN = 'TKN'
BNT = 'BNT'

def add(a, b):
    assert a + b <= MAX, 'error {} + {}'.format(a, b)
    return a + b

def sub(a, b):
    assert a - b >= MIN, 'error {} - {}'.format(a, b)
    return a - b

def mul(a, b):
    assert a * b <= MAX, 'error {} * {}'.format(a, b)
    return a * b

def div(a, b):
    assert b != 0, 'error {} / {}'.format(a, b)
    return a // b

def ratio(x, n, d):
    return x if n == d else div(mul(x, n), d)

def swap(X, Y, x):
    return div(mul(Y, x), add(X, x))

class Token():
    def __init__(self, symbol):
        self.symbol = symbol
        self.totalSupply = 0
        self.balanceOf = {}
    def register(self, user):
        self.balanceOf[user] = 0
    def mint(self, user, amount):
        self.totalSupply = add(self.totalSupply, amount)
        self.balanceOf[user] = add(self.balanceOf[user], amount)
    def burn(self, user, amount):
        self.totalSupply = sub(self.totalSupply, amount)
        self.balanceOf[user] = sub(self.balanceOf[user], amount)
    def transfer(self, source, target, amount):
        self.balanceOf[source] = sub(self.balanceOf[source], amount)
        self.balanceOf[target] = add(self.balanceOf[target], amount)
    def serialize(self):
        return {
            'totalSupply': self.totalSupply,
            'balanceOf': self.balanceOf,
        }

class Branch():
    def __init__(self, token):
        self.reserveRate = 0
        self.reserveStaked = 0
        self.reserveToken = token
        self.poolToken = Token('pool' + token.symbol)
    def addLiquidity(self, pool, user, amount):
        reserveAmount = amount if amount != 'all' else self.reserveToken.balanceOf[user]
        supplyAmount = ratio(reserveAmount, self.poolToken.totalSupply, self.reserveStaked)
        self.reserveToken.transfer(user, pool, reserveAmount)
        self.poolToken.mint(user, supplyAmount)
        self.reserveStaked = add(self.reserveStaked, reserveAmount)
    def remLiquidity(self, pool, user, amount):
        supplyAmount = amount if amount != 'all' else self.poolToken.balanceOf[user]
        reserveAmount = ratio(supplyAmount, self.reserveStaked, self.poolToken.totalSupply)
        self.poolToken.burn(user, supplyAmount)
        self.reserveToken.transfer(pool, user, reserveAmount)
        self.reserveStaked = sub(self.reserveStaked, reserveAmount)
    def reserveBalance(self, id):
        return self.reserveToken.balanceOf[id]
    def serialize(self):
        return {
            'reserveRate': self.reserveRate,
            'reserveStaked': self.reserveStaked,
            'reserveToken': self.reserveToken.serialize(),
            'poolToken': self.poolToken.serialize(),
        }

class Pool():
    def __init__(self, id, swapFee, tkn, bnt):
        self.id = id
        self.swapFee = swapFee
        self.branches = {token.symbol: Branch(token) for token in [tkn, bnt]} 
    def setRates(self, tknRate, bntRate):
        self.branches[TKN].reserveRate = tknRate
        self.branches[BNT].reserveRate = bntRate
    def addLiquidity(self, symbol, user, amount):
        self.branches[symbol].addLiquidity(self.id, user, amount)
    def remLiquidity(self, symbol, user, amount):
        self.branches[symbol].remLiquidity(self.id, user, amount)
    def swap(self, sourceSymbol, targetSymbol, user, amount):
        sourceBranch = self.branches[sourceSymbol]
        targetBranch = self.branches[targetSymbol]
        targetAmount = swap(
            sourceBranch.reserveBalance(self.id),
            targetBranch.reserveBalance(self.id),
            amount
        )
        feeAmount = div(mul(targetAmount, self.swapFee), PPM)
        sourceBranch.reserveToken.transfer(user, self.id, amount)
        targetBranch.reserveToken.transfer(self.id, user, sub(targetAmount, feeAmount))
        targetBranch.reserveStaked = add(targetBranch.reserveStaked, feeAmount)
    def closeArbitrage(self, user):
        tknBranch = self.branches[TKN]
        bntBranch = self.branches[BNT]
        amount = tknBranch.reserveStaked - tknBranch.reserveToken.balanceOf[self.id]
        if amount > 0:
            self.swap(TKN, BNT, user, amount)
        if amount < 0:
            self.swap(BNT, TKN, user, -swap(
                tknBranch.reserveBalance(self.id),
                bntBranch.reserveBalance(self.id),
                amount
            ))
    def serialize(self):
        return {
            'swapFee': self.swapFee,
            TKN: self.branches[TKN].serialize(),
            BNT: self.branches[BNT].serialize(),
        }

def newPool(swapFee, numOfUsers, initialAmount):
    pool = Pool('pool', swapFee, Token(TKN), Token(BNT))
    for symbol in [TKN, BNT]:
        pool.branches[symbol].reserveToken.register(pool.id)
        for i in range(numOfUsers):
            userId = 'user{}'.format(i + 1)
            pool.branches[symbol].poolToken.register(userId)
            pool.branches[symbol].reserveToken.register(userId)
            pool.branches[symbol].reserveToken.mint(userId, initialAmount)
    return pool
