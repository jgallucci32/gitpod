/**
 * Copyright (c) 2020 TypeFox GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License-AGPL.txt in the project root for license information.
 */

require("../../../styles/port-view.css");

import { PortsStatus } from "@gitpod/supervisor-api-grpc/lib/status_pb";
import { Message } from "@phosphor/messaging";
import { DisposableCollection } from "@theia/core";
import { ReactWidget } from "@theia/core/lib/browser/widgets/react-widget";
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { MiniBrowserOpenHandler } from "@theia/mini-browser/lib/browser/mini-browser-open-handler";
import { inject, injectable } from "inversify";
import * as React from 'react';
import { GitpodServiceProvider } from "../gitpod-service-provider";
import { GitpodPortsService, isExposedPort } from "./gitpod-ports-service";


export const PORT_WIDGET_FACTORY_ID = 'ports';

@injectable()
export class GitpodPortViewWidget extends ReactWidget {
    @inject(MiniBrowserOpenHandler) protected miniBrowserOpenHandler: MiniBrowserOpenHandler;
    @inject(GitpodPortsService) protected portsService: GitpodPortsService;
    @inject(GitpodServiceProvider) protected serviceProvider: GitpodServiceProvider;
    @inject(WindowService) private readonly windowService: WindowService;

    static LABEL = 'Open Ports';

    constructor() {
        super();
        this.node.tabIndex = 0;

        this.id = PORT_WIDGET_FACTORY_ID;
        this.title.label = GitpodPortViewWidget.LABEL;
        this.title.iconClass = 'fa fa-superpowers';
        this.title.closable = true;
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected render(): React.ReactNode {
        return <GitpodPortViewComponent service={this.portsService} onOpenBrowser={this.openInBrowser} onOpenPreview={this.openInMiniBrowser} />;
    }

    protected openInBrowser = (url: string) => {
        this.windowService.openNewWindow(url, { external: true });
    }

    protected openInMiniBrowser = async (url: string) => {
        await this.miniBrowserOpenHandler.openPreview(url);
    }

}

interface GitpodPortViewProps {
    service: GitpodPortsService;
    onOpenBrowser: (url: string) => void;
    onOpenPreview: (url: string) => void;
}
class GitpodPortViewComponent extends React.Component<GitpodPortViewProps> {

    private readonly toDisposeOnUnmount = new DisposableCollection();
    componentDidMount(): void {
        this.toDisposeOnUnmount.push(
            this.props.service.onDidChange(() => this.forceUpdate())
        );
    }
    componentWillUnmount(): void {
        this.toDisposeOnUnmount.dispose();
    }

    render(): React.ReactNode {
        const nodes = [];
        for (const port of this.props.service.ports) {
            nodes.push(<GitpodPortComponent {...{ ...this.props, port: port }} />);
        }
        return (<div className="portlist">
            {nodes.length ? nodes : <div style={{ padding: "var(--theia-ui-padding)" }}>There are no services listening on any ports.</div>}
        </div>);
    }
}

export interface GitpodPortComponentProps extends GitpodPortViewProps {
    port: PortsStatus.AsObject
}
class GitpodPortComponent extends React.Component<GitpodPortComponentProps> {

    render(): JSX.Element {
        const port = this.props.port;

        let label;
        const actions = [];
        if (!port.served) {
            label = 'not served';
        } else if (!port.exposed) {
            // This is an intermediate state now as we auto-open ports
            label = 'detecting...'
        } else {
            // TODO: extract serving process name (e.g. use netstat instead of /proc/net/tcp) and show here, i.e. don't override the label
            label = `open ${port.exposed.pb_public ? '(public)' : '(private)'}`;

            actions.push(<button className="theia-button" onClick={this.onOpenPreview}>Open Preview</button>);
            actions.push(<button className="theia-button" onClick={this.onOpenBrowser}>Open Browser</button>);
            actions.push(<button className="theia-button" onClick={this.toggleVisiblity}>Make {port.exposed.pb_public ? 'Private' : 'Public'}</button>);
        }

        const useIndicatorClass = `status-${port.served ? 'ib' : 'nb'}-${port.exposed ? 'ie' : 'ne'}`;
        return <div className="row exposedPort" id={"port-" + port.localPort}>
            <span className="useindicator"><i className={"fa " + useIndicatorClass}></i></span>
            <span className="number">{port.globalPort}</span>
            <span className="name"> – {label}</span>
            <span className="actions">
                {actions}
            </span>
        </div>
    }

    private readonly onOpenPreview = () => {
        if (isExposedPort(this.props.port)) {
            this.props.onOpenPreview(this.props.port.exposed.url);
        }
    }

    private readonly onOpenBrowser = () => {
        if (isExposedPort(this.props.port)) {
            this.props.onOpenBrowser(this.props.port.exposed.url);
        }
    }

    private readonly toggleVisiblity = () => {
        if (isExposedPort(this.props.port)) {
            this.props.service.setVisibility(this.props.port, this.props.port.exposed.pb_public ? 'private' : 'public');
        }
    }
}
