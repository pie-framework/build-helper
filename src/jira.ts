import JiraClient, { Version } from 'jira-connector';
import * as _ from 'lodash';
const jc = require('jira-connector');

const log = console.log.bind(console, '[jira]');
/**
 * largely lifted from:
 * https://github.com/key-data-systems/semantic-release-jira-releases/blob/master/lib/success.ts
 */
export class Jira {
  private client: JiraClient;
  // tslint:disable-next-line: variable-name
  constructor(host: string, email: string, api_token: string) {
    this.client = new jc({
      basic_auth: { email, api_token },
      host,
    });
  }

  public async getProject(projectId: string) {
    log('[getProject] projectId:', projectId);
    const result = await this.client.project.getProject({
      projectIdOrKey: projectId,
    });
    log('[getProject]: id:', projectId, result && result.id);
    return result;
  }

  public async findStatus(name: string): Promise<any> {
    if (!name) {
      return undefined;
    }
    const statuses = await this.client.status.getAllStatuses({
      projectIdOrKey: 'JAT',
    });

    const filtered = statuses.filter(
      (s) =>
        s.name.toLowerCase() === name.toLowerCase() && s.scope === undefined
    );
    console.log('[findWorkflow]', filtered);

    if (filtered.length === 0) {
      console.error('cant find status with name', name);
      return undefined;
    }
    if (filtered.length > 1) {
      console.error('found multiple statuses with name', name);
      return undefined;
    }
    // .map((w) => w.scope?.project)
    // ); //.map((w) => w.name)
    //);
    return filtered[0];
  }

  public async deleteVersions(projectId: string) {
    const remoteVersions = await this.client.project.getVersions({
      projectIdOrKey: projectId,
    });

    console.log('remoteVersions', remoteVersions);
    const pe = remoteVersions.filter((rv) =>
      rv.name.startsWith('@pie-element')
    );

    console.log('pe:', pe);
    await Promise.all(
      pe.map(async (p) => {
        console.log('id?', p.id);
        const result = await this.client.version.deleteVersion({
          versionId: p.id,
        });
        console.log('result:', result);
        return result;
      })
    );
  }

  public async findOrCreateVersion(
    projectId: number,
    name: string,
    dryRun: boolean
  ): Promise<Version> {
    const remoteVersions = await this.client.project.getVersions({
      projectIdOrKey: projectId,
    });

    log(`[findOrCreateVersion] name: ${name}, projectId:  ${projectId}`);

    const existing = _(remoteVersions).find((rv) => rv.name === name); //_.find<{ id: string }>(remoteVersions, { name });
    if (existing) {
      log(`Found existing release '${existing.id}'`);
      return existing;
    }

    log(`No existing release found, creating new`);

    let newVersion: Version;
    if (dryRun) {
      log(`dry-run: making a fake release`);
      newVersion = {
        name,
        id: 'dry_run_id',
      } as any;
    } else {
      newVersion = await this.client.version.createVersion({
        name,
        projectId,
        released: true,
        releaseDate: new Date(Date.now()).toISOString(),
      });
    }

    log(`Made new release '${newVersion.id}'`);
    return newVersion;
  }

  public async editIssueFixVersions(
    newVersionName: string,
    releaseVersionId: string,
    issueKey: string,
    dryRun?: boolean
  ): Promise<void> {
    try {
      log(`Adding issue ${issueKey} to '${newVersionName}'`);
      if (dryRun) {
        log('dry run, stopping here.');
        return;
      }
      const changes: any = {
        update: {
          fixVersions: [
            {
              add: { id: releaseVersionId },
            },
          ],
        },
        properties: [],
      };

      await this.client.issue.editIssue({
        issueKey,
        issue: changes,
      });
    } catch (err) {
      const allowedStatusCodes = [400, 404];
      let { statusCode } = err;
      if (typeof err === 'string') {
        try {
          err = JSON.parse(err);
          statusCode = statusCode || err.statusCode;
        } catch (err) {
          // it's not json :shrug:
        }
      }
      if (allowedStatusCodes.indexOf(statusCode) === -1) {
        throw err;
      }
      console.log(err);
      console.error(
        `Unable to update issue ${issueKey} statusCode: ${statusCode}`
      );
    }
  }

  public async changeIssueStatus(
    issueKey: string,
    name?: string
  ): Promise<boolean> {
    if (!name) {
      return false;
    }

    const result = await this.client.issue.getTransitions({ issueKey });
    const transition = (result.transitions || []).find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );

    if (!transition) {
      console.warn('cant find a transition for name:', name);
      return false;
    }

    const tr = await this.client.issue.transitionIssue({
      issueKey,
      transition: { id: transition.id },
    });

    return true;
  }
}
