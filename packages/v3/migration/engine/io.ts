import { Engine } from './Engine';
import { Deployment, History, HistoryExecution, SystemDeployments, SystemState } from './Types';
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
        history: {
            write: (history: History) => {
                fs.writeFileSync(
                    path.join(engine.pathToNetworkFolder, 'history.json'),
                    JSON.stringify(history, null, 4) + `\n`
                );
                return history;
            },
            writeOne: (historyExecution: HistoryExecution) => {
                const migrationHistoryFileName = 'history.json';

                // find the history file in the network folder
                const pathToNetworkFolderFiles = fs.readdirSync(engine.pathToNetworkFolder);
                const pathToMigrationDeploymentFile = pathToNetworkFolderFiles.find(
                    (f: string) => f === migrationHistoryFileName
                );

                // if file not found create an empty one
                if (!pathToMigrationDeploymentFile) {
                    engine.IO.history.write({});
                }

                const currentHistory = engine.IO.history.fetch(engine.pathToNetworkFolder);
                if (!currentHistory[engine.migration.currentMigrationData.fileName]) {
                    currentHistory[engine.migration.currentMigrationData.fileName] = { executions: [] };
                }
                currentHistory[engine.migration.currentMigrationData.fileName].executions.push(historyExecution);
                engine.IO.history.write(currentHistory);
            },
            fetch: (pathToHistory: string) => {
                return JSON.parse(fs.readFileSync(path.join(pathToHistory, 'history.json'), 'utf-8')) as History;
            }
        },
        deployment: {
            write: (pathToWrite: string, deployments: SystemDeployments) => {
                fs.writeFileSync(pathToWrite, JSON.stringify(deployments, null, 4) + `\n`);
                return deployments;
            },
            writeOne: (deployment: Deployment) => {
                const currentMigrationDeploymentFileName = engine.migration.currentMigrationData.fileName + '.json';

                // find the migration file in the network deployments folder
                const pathToNetworkMigrationDeploymentFolder = path.join(engine.pathToNetworkFolder, 'deployments');

                // read all files into the folder and fetch needed file
                const pathToMigrationDeploymentFiles = fs.readdirSync(pathToNetworkMigrationDeploymentFolder);
                const pathToMigrationDeploymentFile = pathToMigrationDeploymentFiles.find(
                    (f: string) => f === currentMigrationDeploymentFileName
                );

                const pathToNetworkMigrationDeploymentFile = path.join(
                    pathToNetworkMigrationDeploymentFolder,
                    currentMigrationDeploymentFileName
                );

                // if file not found create an empty one
                if (!pathToMigrationDeploymentFile) {
                    engine.IO.deployment.write(pathToNetworkMigrationDeploymentFile, {});
                }

                const currentDeployments = engine.IO.deployment.fetch(path.join(pathToNetworkMigrationDeploymentFile));

                // if the metadata of the current contract is not already stored, store it
                if (!currentDeployments[deployment.contractName]) {
                    currentDeployments[deployment.contractName] = deployment;
                    engine.IO.deployment.write(pathToNetworkMigrationDeploymentFile, currentDeployments);
                }
            },
            fetch: (pathToDeployments: string) => {
                return JSON.parse(fs.readFileSync(pathToDeployments, 'utf-8')) as SystemDeployments;
            }
        }
    };
};
