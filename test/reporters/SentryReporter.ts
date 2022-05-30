import * as Sentry from '@sentry/node';
import { MochaOptions, reporters, Runner, Test } from 'mocha';

const { Spec } = reporters;
const { EVENT_RUN_BEGIN, EVENT_TEST_FAIL } = Runner.constants;

interface EnvOptions {
    SENTRY_DSN: string;
}

const { SENTRY_DSN }: EnvOptions = process.env as any as EnvOptions;

class SentryReporter extends Spec {
    constructor(runner: Runner, options: MochaOptions) {
        super(runner, options);

        runner
            .once(EVENT_RUN_BEGIN, () => {
                Sentry.init({
                    dsn: SENTRY_DSN
                });
            })
            .on(EVENT_TEST_FAIL, (test: Test, err) => {
                Sentry.captureException(new Error(test.title), { extra: { error: err.stack } });
            });
    }
}

module.exports = SentryReporter.prototype.constructor;
