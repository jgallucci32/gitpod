// Copyright (c) 2020 TypeFox GmbH. All rights reserved.
// Licensed under the GNU Affero General Public License (AGPL).
// See License-AGPL.txt in the project root for license information.

package ports

import (
	"context"
	"testing"

	"github.com/gitpod-io/gitpod/supervisor/pkg/gitpod"
	"github.com/google/go-cmp/cmp"
)

func TestPortsConfig(t *testing.T) {
	tests := []struct {
		Desc           string
		WorkspacePorts []*gitpod.PortConfig
		GitpodConfig   *gitpod.GitpodConfig
		Expectation    *PortConfigTestExpectations
	}{
		{
			Desc:        "no configs",
			Expectation: &PortConfigTestExpectations{},
		},
		{
			Desc: "workspace port config",
			WorkspacePorts: []*gitpod.PortConfig{
				{
					Port:       9229,
					OnOpen:     "ignore",
					Visibility: "public",
				},
			},
			Expectation: &PortConfigTestExpectations{
				WorkspaceConfigs: []*gitpod.PortConfig{
					{
						Port:       9229,
						OnOpen:     "ignore",
						Visibility: "public",
					},
				},
			},
		},
		{
			Desc: "instance port config",
			GitpodConfig: &gitpod.GitpodConfig{
				Ports: []*gitpod.PortsItems{
					{
						Port:       9229,
						OnOpen:     "ignore",
						Visibility: "public",
					},
				},
			},
			Expectation: &PortConfigTestExpectations{
				InstancePortConfigs: []*gitpod.PortConfig{
					{
						Port:       9229,
						OnOpen:     "ignore",
						Visibility: "public",
					},
				},
			},
		},
		{
			Desc: "instance range config",
			GitpodConfig: &gitpod.GitpodConfig{
				Ports: []*gitpod.PortsItems{
					{
						Port:       "9229-9339",
						OnOpen:     "ignore",
						Visibility: "public",
					},
				},
			},
			Expectation: &PortConfigTestExpectations{
				InstanceRangeConfigs: []*RangeConfig{
					{
						PortsItems: &gitpod.PortsItems{
							Port:       "9229-9339",
							OnOpen:     "ignore",
							Visibility: "public",
						},
						Start: 9229,
						End:   9339,
					},
				},
			},
		},
	}
	for _, test := range tests {
		t.Run(test.Desc, func(t *testing.T) {
			configService := &testGitpodConfigService{
				configs: make(chan *gitpod.GitpodConfig),
				errors:  make(chan error),
			}
			defer close(configService.configs)
			defer close(configService.errors)

			gitpodAPI := &testGitpodAPI{
				res: &gitpod.WorkspaceInfo{
					Workspace: &gitpod.Workspace{
						Config: &gitpod.WorkspaceConfig{
							Ports: test.WorkspacePorts,
						},
					},
				},
			}

			service := NewConfigService("test", configService, gitpodAPI)
			context, cancel := context.WithCancel(context.Background())
			defer cancel()
			updates, errors := service.Observe(context)

			go func() {
				configService.configs <- test.GitpodConfig
			}()

			select {
			case err := <-errors:
				t.Fatal(err)
			case <-updates:
			}
			actual := &PortConfigTestExpectations{
				InstanceRangeConfigs: service.instanceRangeConfigs,
			}
			for _, config := range service.workspaceConfigs {
				actual.WorkspaceConfigs = append(actual.WorkspaceConfigs, config)
			}
			for _, config := range service.instancePortConfigs {
				actual.InstancePortConfigs = append(actual.InstancePortConfigs, config)
			}
			if diff := cmp.Diff(test.Expectation, actual); diff != "" {
				t.Errorf("unexpected output (-want +got):\n%s", diff)
			}
		})
	}
}

type PortConfigTestExpectations struct {
	WorkspaceConfigs     []*gitpod.PortConfig
	InstancePortConfigs  []*gitpod.PortConfig
	InstanceRangeConfigs []*RangeConfig
}

type testGitpodConfigService struct {
	configs chan *gitpod.GitpodConfig
	errors  chan error
}

func (service *testGitpodConfigService) Observe(ctx context.Context) (<-chan *gitpod.GitpodConfig, <-chan error) {
	return service.configs, service.errors
}

type testGitpodAPI struct {
	res *gitpod.WorkspaceInfo
	err error
}

func (service *testGitpodAPI) GetWorkspace(ctx context.Context, id string) (res *gitpod.WorkspaceInfo, err error) {
	return service.res, service.err
}
