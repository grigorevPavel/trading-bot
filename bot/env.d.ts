declare namespace NodeJs {
    interface ProcessEnv {
        PRIVATE_KEY: string,
        RPC: string,
        MULTICALL: string
    }
}

export { NodeJs }