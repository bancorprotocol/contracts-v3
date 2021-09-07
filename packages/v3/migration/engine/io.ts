import { Engine } from './engine';
import { Deployment, SystemDeployments, SystemState } from './types';
import fs from 'fs';
import path from 'path';

export const initIO = (engine: Engine) => {
    return {
        state: {
            write: (state: SystemState) => {
                fs.writeFileSync(
                    path.join(engine.pathToNetworkFolder, 'state.json'),
                    JSON.stringify(state, null, 4) + `\n`
                );
                return state;
            },
            fetch: (pathToState: string) => {
                return JSON.parse(fs.readFileSync(path.join(pathToState, 'state.json'), 'utf-8')) as SystemState;
            }
        },
        deployment: {
            write: (deployments: SystemDeployments) => {
                fs.writeFileSync(
                    path.join(engine.pathToNetworkFolder, 'deployment.json'),
                    JSON.stringify(deployments, null, 4) + `\n`
                );
                return deployments;
            },
            writeOne: (address: string, deployment: Deployment) => {
                const currentDeployments = engine.IO.deployment.fetch(engine.pathToNetworkFolder);
                currentDeployments[address] = deployment;
                engine.IO.deployment.write(currentDeployments);
            },
            fetch: (pathToState: string) => {
                return JSON.parse(
                    fs.readFileSync(path.join(pathToState, 'deployment.json'), 'utf-8')
                ) as SystemDeployments;
            }
        }
    };
};
