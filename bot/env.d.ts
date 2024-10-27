declare namespace NodeJs {
    interface ProcessEnv {
        PRIVATE_KEY: string,
        RPC: string,
        MULTICALL: string,
        CRON_JOB: string,
        MIN_BASE_CURRENCY_PROFIT: bigint
    }
}

export { NodeJs }