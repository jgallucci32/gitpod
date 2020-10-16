/**
 * Copyright (c) 2020 TypeFox GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License-AGPL.txt in the project root for license information.
 */

import { PortVisibility } from '@gitpod/gitpod-protocol';
import type { PortsStatus } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { Emitter } from '@theia/core/lib/common/event';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, postConstruct } from 'inversify';
import { GitpodPortServer, ExposeGitpodPortParams } from '../../common/gitpod-port-server';
import { getWorkspaceID } from '../utils';
import { GitpodServiceProvider } from '../gitpod-service-provider';
import { MaybePromise } from '@theia/core/lib/common/types';

export interface ExposedPort extends PortsStatus.AsObject {
    served: true
    exposed: PortsStatus.ExposedPortInfo.AsObject
}
export function isExposedPort(port: PortsStatus.AsObject | undefined): port is ExposedPort {
    return !!port?.exposed && !!port.served;
}

@injectable()
export class GitpodPortsService {

    private readonly deferredReady = new Deferred<void>();
    private readonly _ports = new Map<number, PortsStatus.AsObject>();

    private readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    private readonly onDidExposePortEmitter = new Emitter<ExposedPort>();
    readonly onDidExposePort = this.onDidExposePortEmitter.event;

    @inject(GitpodPortServer)
    private readonly server: GitpodPortServer;

    private readonly workspaceID = getWorkspaceID()

    @inject(GitpodServiceProvider)
    private readonly serviceProvider: GitpodServiceProvider;

    @postConstruct()
    protected async init(): Promise<void> {
        this.updatePorts(await this.server.getPorts());
        this.server.setClient({
            onDidChange: ({ ports }) => this.updatePorts(ports)
        });
        this.deferredReady.resolve();
    }

    get ports(): IterableIterator<PortsStatus.AsObject> {
        return this._ports.values();
    }

    private updatePorts(ports: PortsStatus.AsObject[]): void {
        const toDelete = new Set<number>();
        for (const port of ports) {
            const current = this._ports.get(port.localPort);
            this._ports.set(port.localPort, port);
            if (isExposedPort(port) && !isExposedPort(current)) {
                this.onDidExposePortEmitter.fire(port);
            }
        }
        for (const port of toDelete) {
            this._ports.delete(port);
        }
        this.onDidChangeEmitter.fire();
    }

    exposePort(params: ExposeGitpodPortParams): MaybePromise<void> {
        if (isExposedPort(this._ports.get(params.port))) {
            return;
        }
        const pendingExposePort = new Deferred<void>();
        const listener = this.onDidExposePort(port => {
            if (port.localPort === params.port) {
                listener.dispose();
                pendingExposePort.resolve();
            }
        })
        this.server.exposePort(params).catch(pendingExposePort.reject)
        return pendingExposePort.promise;
    }

    async setVisibility(port: ExposedPort, visibility: PortVisibility): Promise<void> {
        await this.serviceProvider.getService().server.openPort(this.workspaceID, {
            port: port.localPort,
            targetPort: port.globalPort,
            visibility
        });
    }

}