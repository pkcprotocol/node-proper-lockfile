declare module '@segment/clear-timeouts' {
    function clearTimeouts(): void;
    namespace clearTimeouts {
        function install(): void;
    }
    export = clearTimeouts;
}

declare module 'execa' {
    interface ExecaReturnValue {
        stdout: string;
        stderr: string;
        exitCode: number;
    }
    interface Options {
        reject?: boolean;
        [key: string]: any;
    }
    function execa(file: string, args?: string[], options?: Options): Promise<ExecaReturnValue>;
    export = execa;
}
