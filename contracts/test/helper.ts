import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { randomBytes } from 'crypto';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers/lib/ethers';

export const randomAddress = () => {
    const id = randomBytes(32).toString("hex");
    const privateKey = "0x" + id;
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
};

export const addSigner = async (
    address: string
): Promise<SignerWithAddress> => {
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [address],
    });
    await network.provider.send("hardhat_setBalance", [
        address,
        "0x1000000000000000000",
    ]);
    return await ethers.getSigner(address);
};

export const removeSigner = async (address: string) => {
    await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [address],
    });
};

export const useSigner = async (
    address: string,
    f: (signer: SignerWithAddress) => Promise<void>
) => {
    const signer = await addSigner(address);
    await f(signer);
    await removeSigner(address);
};

export const sleepTo = async (timestamp: BigNumberish) => {
    await network.provider.send("evm_setNextBlockTimestamp", [
        Number(timestamp),
    ]);
    await network.provider.send("evm_mine");
};

export const sleep = async (seconds: BigNumberish) => {
    await network.provider.send("evm_increaseTime", [
        Number(seconds),
    ]);
    await network.provider.send("evm_mine");
};

export const epsEqual = (
    a: BigNumber,
    b: BigNumber,
    eps: BigNumber = BigNumber.from(1),
    decimals: BigNumber = BigNumber.from(10).pow(4),
    zeroThresh = BigNumber.from(10).pow(1)
) => {
    if (a.eq(b)) return true;

    let res: boolean = false
    if (a.eq(0)) res = b.lte(zeroThresh)
    if (b.eq(0)) res = a.lte(zeroThresh)
    // |a - b| / a < eps <==> a ~ b
    if (!(a.mul(b)).eq(0)) res = (((a.sub(b)).abs()).mul(decimals).div(a)).lt(eps)

    if (!res) console.log(`A = ${Number(a)}, B = ${Number(b)}`)
    return res
}

export const epsEqualNumber = (
    a: number,
    b: number,
    eps: number = 1,
    decimals: number = 10 ** 4
) => {
    if (a === b) return true;

    let res: boolean = false
    if (a === 0) res = b < eps
    if (b === 0) res = a < eps
    // |a - b| / a < eps <==> a ~ b
    if (a * b !== 0) res = (Math.abs(a - b) / a) < eps

    if (!res) console.log(`A = ${Number(a)}, B = ${Number(b)}`)
    return res
}


export type Investment = {
    deadline: BigNumber
    pair: string
}

export const ONE = ethers.constants.WeiPerEther

