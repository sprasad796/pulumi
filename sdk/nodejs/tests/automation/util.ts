// Copyright 2016, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { exec } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { LocalWorkspaceOptions, ProjectRuntime, Stack } from "../../automation";

/** @internal */
export function getTestSuffix() {
    return randomUUID();
}

/** @internal */
export async function getTestOrg() {
    // Use "organization" for local file backend
    let test_org = "organization";

    if (process.env.PULUMI_TEST_ORG) {
        return process.env.PULUMI_TEST_ORG;
    }

    if (!process.env.PULUMI_ACCESS_TOKEN) {
        return test_org;
    }

    const pulumi_whoami_org = await getUserName();

    if (pulumi_whoami_org) {
        return pulumi_whoami_org;
    }

    if (process.env.PULUMI_ACCESS_TOKEN) {
        test_org = "moolumi";
    }
    // Use "organization" for local file backend
    return test_org;
}

export async function getUserName(): Promise<string> {
    let str = "";
    return new Promise((resolve, reject) => {
        exec("pulumi whoami", (error, stdout, stderr) => {
            if (error) {
                console.error(`Execution error: ${error.message}`);
                return str;
            }
            if (stderr) {
                console.error(`Shell error output: ${stderr}`);
                return str;
            }
            str = stdout.trim();
            return resolve(stdout.trim());
        });
    });
    return str;
}

/**
 * Augments the provided {@link LocalWorkspaceOptions} so that they reference a
 * either a file backend or a cloud backend, depending on whether PULUMI_ACCESS_TOKEN
 * is set in the environment.
 *
 * @internal
 */
export function withTestBackend(
    opts?: LocalWorkspaceOptions,
    name?: string,
    description?: string,
    runtime?: string,
): LocalWorkspaceOptions {
    if (process.env.PULUMI_ACCESS_TOKEN) {
        return withCloudBackend(opts, name, description, runtime);
    }
    return withTemporaryFileBackend(opts, name, description, runtime);
}

function withCloudBackend(
    opts?: LocalWorkspaceOptions,
    name?: string,
    description?: string,
    runtime?: string,
): LocalWorkspaceOptions {
    let url = "https://api.pulumi.com";
    if (process.env.PULUMI_BACKEND_URL) {
        url = process.env.PULUMI_BACKEND_URL;
    }
    const backend = {
        url: url,
    };
    if (name === undefined) {
        name = "node_test";
    }
    if (runtime === undefined) {
        runtime = "nodejs";
    }
    return {
        ...opts,
        projectSettings: {
            // We are obliged to provide a name and runtime if we provide project
            // settings, so we do so, but we spread in the provided project settings
            // afterwards so that the caller can override them if need be.
            name: name,
            runtime: runtime as ProjectRuntime,
            description: description,

            ...opts?.projectSettings,
            backend,
        },
    };
}

function withTemporaryFileBackend(
    opts?: LocalWorkspaceOptions,
    name?: string,
    description?: string,
    runtime?: string,
): LocalWorkspaceOptions {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodejs-tests-automation-"));

    const backend = { url: `file://${tmpDir}` };

    if (name === undefined) {
        name = "node_test";
    }
    if (runtime === undefined) {
        runtime = "nodejs";
    }

    return withTestConfigPassphrase({
        ...opts,
        pulumiHome: tmpDir,
        projectSettings: {
            // We are obliged to provide a name and runtime if we provide project
            // settings, so we do so, but we spread in the provided project settings
            // afterwards so that the caller can override them if need be.
            name: name,
            runtime: runtime as ProjectRuntime,
            description: description,

            ...opts?.projectSettings,
            backend,
        },
    });
}

/**
 * Augments the provided {@link LocalWorkspaceOptions} so that they set up an
 * environment containing a test `PULUMI_CONFIG_PASSPHRASE` variable suitable
 * for use with a local file backend.
 */
function withTestConfigPassphrase(opts?: LocalWorkspaceOptions): LocalWorkspaceOptions {
    return {
        ...opts,
        envVars: {
            ...opts?.envVars,
            PULUMI_CONFIG_PASSPHRASE: "test",
        },
    };
}

/**
 * Runs a test function with a stack, ensuring the stack is destroyed and
 * removed after the test completes, even if the test fails.
 *
 * Set destroy to false to skip the destroy step.
 *
 * @internal
 */
export async function withStack<T>(
    stack: Stack,
    fn: (stack: Stack) => Promise<T>,
    { destroy = true }: { destroy?: boolean } = {},
): Promise<T> {
    try {
        return await fn(stack);
    } finally {
        try {
            if (destroy) {
                await stack.destroy();
            }
        } finally {
            await stack.workspace.removeStack(stack.name, { force: true });
        }
    }
}
