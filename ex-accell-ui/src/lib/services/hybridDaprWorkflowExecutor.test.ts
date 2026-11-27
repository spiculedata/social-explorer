// The workflow Python child process must not inherit the web app's secrets, so it gets the same
// environment allow-list as Jupyter kernels (jupyterEnvironment) plus Dapr connection overrides.

import { describe, expect, it } from 'vitest';
import { workflowPythonEnvironment } from './hybridDaprWorkflowExecutor';

describe('workflowPythonEnvironment', () => {
	it('drops the app secrets instead of inheriting them, keeps Dapr overrides', () => {
		const env = workflowPythonEnvironment(
			{
				PATH: '/bin',
				HOME: '/h',
				DATABASE_URL: 'postgres://x',
				SESSION_SECRET: 'secret',
				ADMIN_PASSWORD: 'password',
				HF_TOKEN: 'token',
				DAPR_HTTP_PORT: '9999'
			},
			{
				PYTHONPATH: '/venv',
				DAPR_HTTP_ENDPOINT: 'http://localhost:3500',
				DAPR_GRPC_ENDPOINT: 'http://localhost:50001',
				DAPR_HTTP_PORT: '3500',
				DAPR_GRPC_PORT: '50001'
			}
		);

		expect(env).toEqual({
			PATH: '/bin',
			HOME: '/h',
			DATABASE_URL: 'postgres://x',
			PYTHONPATH: '/venv',
			DAPR_HTTP_ENDPOINT: 'http://localhost:3500',
			DAPR_GRPC_ENDPOINT: 'http://localhost:50001',
			DAPR_HTTP_PORT: '3500',
			DAPR_GRPC_PORT: '50001'
		});
		expect(env).not.toHaveProperty('SESSION_SECRET');
		expect(env).not.toHaveProperty('ADMIN_PASSWORD');
		expect(env).not.toHaveProperty('HF_TOKEN');
	});

	it('keeps the proxy, CA bundle and model-cache settings workflows may need, like Jupyter', () => {
		const env = workflowPythonEnvironment(
			{
				HTTPS_PROXY: 'http://p:3128',
				SSL_CERT_FILE: '/etc/ca.pem',
				NLTK_DATA: '/cache/nltk',
				ADMIN_PASSWORD: 'password'
			},
			{}
		);

		expect(env).toEqual({ HTTPS_PROXY: 'http://p:3128', SSL_CERT_FILE: '/etc/ca.pem', NLTK_DATA: '/cache/nltk' });
	});
});
