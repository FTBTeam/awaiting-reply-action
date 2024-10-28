const core = require('@actions/core');
const github = require('@actions/github');

const getOctokit = () => {
    const token = core.getInput('token');
    if (!token) return core.setFailed('Token is required')
    return github.getOctokit(token);
}

const hasLabel = (label, issue) => {
    const lMap = issue.labels.map(m => m.name);
    return lMap.includes(label);
}

(async () => {
    try {
        const debug = Boolean(core.getInput('debug'));
        if (debug) {
            core.info(`Debug enabled: ${debug}`)
        }

        const awaitingLabel = core.getInput('awaiting-label');
        if (!awaitingLabel) return core.setFailed('Awaiting label is required')
        if (debug) core.info(`Label to toggle: ${awaitingLabel}`)

        const repliedLabel = core.getInput('replied-label');
        if (!repliedLabel) return core.setFailed('Replied label is required')
        if (debug) core.info(`Label to toggle: ${repliedLabel}`)

        const ignoreLabels = core.getInput('ignore-labels');
        if (debug) core.info(`Ignore labels: ${ignoreLabels}`)
        const ignoreLabelsList = ignoreLabels.split(',').map(m => m.trim());

        const removeLabels = core.getInput('remove-labels');
        if (debug) core.info(`Remove labels: ${removeLabels}`)
        const removeLabelsList = removeLabels.split(',').map(m => m.trim());

        const excludeUsers = core.getInput('exclude-users');
        if (debug) core.info(`Exclude users: ${excludeUsers}`)
        const excludeUsersList = excludeUsers.split(',').map(m => m.trim());

        const removeOnlyIfAuthor = Boolean(core.getInput('remove-only-if-author'));
        if (debug) core.info(`Remove only if author: ${removeOnlyIfAuthor}`)

        const ignoreString = core.getInput('ignore-string');
        if (debug) core.info(`Ignore comment with string: ${ignoreString}`)

        const octokit = getOctokit();
        const ctx = github.context;

        if (debug) core.info(`Event: ${ctx.eventName}`)
        if (debug) core.info(`Action: ${ctx.payload.action}`)

        if (ctx.eventName === 'issue_comment' && ctx.payload.action === 'created') {
            if (debug) core.info('Issue comment created event detected')
            if (ignoreLabelsList.length > 0) {
                for (const il of ignoreLabelsList) {
                    if (hasLabel(il, ctx.payload.issue)) {
                        core.info(`Issue has ignore label: ${il}`)
                        return null
                    }
                }
            }

            const {data: issue} = await octokit.rest.issues.get({
                owner: ctx.repo.owner,
                repo: ctx.repo.repo,
                issue_number: ctx.payload.issue.number
            })

            if (issue.state === 'closed') {
                core.info(`Issue is closed, skipping`)
                return null
            }

            let commenterIsOrgMember = false;
            try {
                if (debug) core.info('Checking if comment is made by an org member\nUser:' + ctx.payload.comment.user.login)
                const token = core.getInput('token');
                if (!token) return core.setFailed('Token is required')
                const {status} = await octokit.rest.orgs.checkMembershipForUser({
                    org: ctx.repo.owner,
                    username: ctx.payload.comment.user.login
                })
                if (debug) core.info('User status: ' + status + '\n204 = requester is a member of the organization\n302 = requester is not a member of the organization\n404 = requester is an organization member and user is not')

                if (status === 204) commenterIsOrgMember = true;
            } catch (error) {
                if (debug) core.info('User status: ' + error.status + '\n204 = requester is a member of the organization\n302 = requester is not a member of the organization\n404 = requester is an organization member and user is not')
                if (error.status === 404) {
                    core.info('User is not an org member')
                } else {
                    core.error(error.response.data.message)
                }
            }

            if (ignoreString && commenterIsOrgMember && ctx.payload.comment.body.includes(ignoreString)) {
                core.info(`Comment contains ignore string: ${ignoreString}`)
                return null
            }

            const isCommenterExcluded = excludeUsersList.includes(ctx.payload.comment.user.login);
            if (isCommenterExcluded) {
                core.info(`Commenter is excluded: ${ctx.payload.comment.user.login}`)
                return null
            }

            const isCommenterAuthor = ctx.payload.comment.user.id === ctx.payload.issue.user.id;
            if (debug) {
                core.info(`Commenter is author: ${isCommenterAuthor}`)
                core.info(`Commenter is org member: ${commenterIsOrgMember}`)
            }

            if (commenterIsOrgMember) {
                if (!hasLabel(awaitingLabel, issue)) {
                    octokit.rest.issues.addLabels({
                        owner: ctx.repo.owner,
                        repo: ctx.repo.repo,
                        issue_number: ctx.payload.issue.number,
                        labels: [awaitingLabel]
                    })
                }
            } else {
                if (removeOnlyIfAuthor && !isCommenterAuthor) {
                    core.info(`Commenter is not author, skipping`)
                    return null
                }
                if (hasLabel(awaitingLabel, issue)) {
                    octokit.rest.issues.removeLabel({
                        owner: ctx.repo.owner,
                        repo: ctx.repo.repo,
                        issue_number: ctx.payload.issue.number,
                        name: awaitingLabel
                    })
                    octokit.rest.issues.addLabels({
                        owner: ctx.repo.owner,
                        repo: ctx.repo.repo,
                        issue_number: ctx.payload.issue.number,
                        labels: [repliedLabel]
                    })
                }
                if (removeLabelsList.length > 0) {
                    for (const l of removeLabelsList) {
                        if (hasLabel(l, issue)) {
                            if (debug) core.info(`Removing extra label: ${l}`)
                            octokit.rest.issues.removeLabel({
                                owner: ctx.repo.owner,
                                repo: ctx.repo.repo,
                                issue_number: ctx.payload.issue.number,
                                name: l
                            })
                        }
                    }
                }
            }
        }
    } catch (error) {
        core.setFailed(error.message);
    }
})()
