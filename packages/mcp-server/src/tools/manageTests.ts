import { BridgeClient } from '../bridge/bridgeClient.js';

const TEST_DIR = '.lunaide/tests';
const RESULT_START = '__LUNAIDE_TEST_RESULT__';
const RESULT_END = '__END__';

// -- Luau Runner Harness --
// Prepended to test file content at execution time. Runs tests via pcall,
// benchmarks via os.clock(), then prints structured JSON between markers.
const RUNNER_HARNESS = `
-- LunaIDE Test Runner Harness
local function __runTests(suite)
    local results = {
        name = suite.name or "Unknown Suite",
        tests = {},
        benchmarks = {},
        summary = { total = 0, passed = 0, failed = 0 },
    }

    if suite.tests then
        for _, test in ipairs(suite.tests) do
            results.summary.total += 1
            local ok, err = pcall(test.fn)
            if ok then
                results.summary.passed += 1
                table.insert(results.tests, { name = test.name, status = "pass" })
            else
                results.summary.failed += 1
                table.insert(results.tests, { name = test.name, status = "fail", error = tostring(err) })
            end
        end
    end

    if suite.benchmarks then
        for _, bench in ipairs(suite.benchmarks) do
            local iterations = bench.iterations or 100
            local times = {}
            for i = 1, iterations do
                local start = os.clock()
                bench.fn()
                table.insert(times, os.clock() - start)
            end
            table.sort(times)
            local sum = 0
            for _, t in ipairs(times) do sum += t end
            table.insert(results.benchmarks, {
                name = bench.name,
                iterations = iterations,
                min = times[1],
                max = times[#times],
                mean = sum / #times,
                median = times[math.ceil(#times / 2)],
            })
        end
    end

    local json = game:GetService("HttpService"):JSONEncode(results)
    print("${RESULT_START}" .. json .. "${RESULT_END}")
end

local __suite = (function()
`;

const RUNNER_SUFFIX = `
end)()
__runTests(__suite)
`;

// -- Helper: Parse structured JSON from runner output --

function parseTestResult(output: string): unknown {
    const start = output.indexOf(RESULT_START);
    if (start === -1) {
        throw new Error('Test runner did not produce structured output. Raw output:\n' + output);
    }

    const jsonStart = start + RESULT_START.length;
    const jsonEnd = output.indexOf(RESULT_END, jsonStart);
    if (jsonEnd === -1) {
        throw new Error('Test runner output is malformed (missing end marker). Raw output:\n' + output);
    }

    try {
        return JSON.parse(output.substring(jsonStart, jsonEnd));
    } catch {
        throw new Error('Failed to parse test result JSON: ' + output.substring(jsonStart, jsonEnd));
    }
}

// -- Helper: Generate .test.luau file content --

type TestDef = { name: string; body: string };
type BenchDef = { name: string; body: string; iterations?: number };

function indent(code: string, level: number): string {
    const pad = '    '.repeat(level);
    return code.split('\n').map(line => pad + line).join('\n');
}

function generateTestFile(name: string, tests: TestDef[], benchmarks?: BenchDef[]): string {
    const testEntries = tests.map(t =>
        `        { name = ${JSON.stringify(t.name)}, fn = function()\n${indent(t.body, 3)}\n        end }`
    ).join(',\n');

    let body = `return {
    name = ${JSON.stringify(name)},
    tests = {
${testEntries},
    },`;

    if (benchmarks?.length) {
        const benchEntries = benchmarks.map(b =>
            `        { name = ${JSON.stringify(b.name)}, iterations = ${b.iterations ?? 100}, fn = function()\n${indent(b.body, 3)}\n        end }`
        ).join(',\n');

        body += `\n    benchmarks = {
${benchEntries},
    },`;
    }

    body += '\n}';
    return body;
}

// -- Helper: Resolve file path --

function testFilePath(name: string): string {
    return `${TEST_DIR}/${name}.test.luau`;
}

// -- Helper: Format success response --

function textResponse(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResponse(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true as const };
}

// -- Tool Definition --

export function manageTestsTool(bridge: BridgeClient) {
    return {
        name: 'manage_tests',
        description:
            'Manage Luau unit tests and benchmarks that run inside Roblox Studio. ' +
            'Actions: create (generate test file), run (execute in Studio), list (find test files), delete (remove test file). ' +
            'Test files are stored in .lunaide/tests/ as .test.luau files.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                action: {
                    type: 'string',
                    enum: ['create', 'run', 'list', 'delete'],
                    description: '"create" generates a test file, "run" executes test(s) in Studio, "list" finds all test files, "delete" removes a test file.',
                },
                name: {
                    type: 'string',
                    description: 'Test suite name (without .test.luau extension). Required for create, run (single), and delete.',
                },
                tests: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Test case name' },
                            body: { type: 'string', description: 'Luau code for the test function body' },
                        },
                        required: ['name', 'body'],
                    },
                    description: 'Array of test definitions. Required for "create" action.',
                },
                benchmarks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Benchmark name' },
                            body: { type: 'string', description: 'Luau code for the benchmark function body' },
                            iterations: { type: 'number', description: 'Number of iterations (default: 100)' },
                        },
                        required: ['name', 'body'],
                    },
                    description: 'Optional array of benchmark definitions for "create" action.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID for "run" action. If omitted, uses the first connected Studio.',
                },
            },
            required: ['action'],
        },

        handler: async (args: {
            action: 'create' | 'run' | 'list' | 'delete';
            name?: string;
            tests?: TestDef[];
            benchmarks?: BenchDef[];
            studioId?: string;
        }) => {
            try {
                switch (args.action) {
                    case 'create': {
                        if (!args.name) throw new Error('name is required for "create" action');
                        if (!args.tests?.length) throw new Error('tests array is required and must not be empty for "create" action');

                        const path = testFilePath(args.name);
                        const content = generateTestFile(args.name, args.tests, args.benchmarks);
                        await bridge.writeScript(path, content, `Create test suite: ${args.name}`);

                        return textResponse({
                            created: path,
                            tests: args.tests.length,
                            benchmarks: args.benchmarks?.length ?? 0,
                        });
                    }

                    case 'run': {
                        let filesToRun: string[];

                        if (args.name) {
                            filesToRun = [testFilePath(args.name)];
                        } else {
                            const found = await bridge.searchFiles('*.test.luau', { include: `${TEST_DIR}/**` }) as Array<{ path: string }>;
                            if (!found?.length) return textResponse({ message: 'No test files found', dir: TEST_DIR });
                            filesToRun = found.map(f => f.path);
                        }

                        const results: unknown[] = [];
                        for (const path of filesToRun) {
                            const source = await bridge.readScript(path);
                            const code = RUNNER_HARNESS + source + RUNNER_SUFFIX;
                            const output = await bridge.runCode(code, args.studioId);
                            const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
                            results.push(parseTestResult(outputStr));
                        }

                        return textResponse(results.length === 1 ? results[0] : results);
                    }

                    case 'list': {
                        const result = await bridge.searchFiles('*.test.luau', { include: `${TEST_DIR}/**` });
                        return textResponse(result);
                    }

                    case 'delete': {
                        if (!args.name) throw new Error('name is required for "delete" action');
                        const path = testFilePath(args.name);
                        await bridge.writeScript(path, '', `Delete test suite: ${args.name}`);
                        return textResponse({ deleted: path });
                    }

                    default:
                        throw new Error(`Invalid action: ${args.action}`);
                }
            } catch (err) {
                return errorResponse(err);
            }
        },
    };
}
