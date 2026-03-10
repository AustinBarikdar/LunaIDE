export const RESULT_START = '__LUNAIDE_TEST_RESULT__';
export const RESULT_END = '__END__';

export const RUNNER_HARNESS = `
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

export const RUNNER_SUFFIX = `
end)()
__runTests(__suite)
`;
