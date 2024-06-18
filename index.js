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

        const label = core.getInput('label');
        if (!label) return core.setFailed('Label is required')
        if (debug) core.info(`Label to toggle: ${label}`)

        const ignoreLabels = core.getInput('ignore-labels');
        if (debug) core.info(`Ignore labels: ${ignoreLabels}`)

        const excludeUsers = core.getInput('exclude-users');
        if (debug) core.info(`Exclude users: ${excludeUsers}`)
        const excludeUsersList = excludeUsers.split(',').map(m => m.trim());

        const removeOnlyIfAuthor = Boolean(core.getInput('remove-only-if-author'));
        if (debug) core.info(`Remove only if author: ${removeOnlyIfAuthor}`)

        const ignoreString = Boolean(core.getInput('ignore-string'));
        if (debug) core.info(`Ignore comment with string: ${ignoreString}`)

        const octokit = getOctokit();
        const ctx = github.context;

        if (debug) core.info(`Event: ${ctx.eventName}`)
        if (debug) core.info(`Action: ${ctx.payload.action}`)

        if (ctx.eventName === 'issue_comment' && ctx.payload.action === 'created') {
            if (debug) core.info('Issue comment created event detected')
            if (ignoreLabels && hasLabel(ignoreLabels, ctx.payload.issue)) {
                core.info(`Issue has ignore label: ${ignoreLabels}`)
                return null
            }

            if (ignoreString && ctx.payload.comment.body.includes(ignoreString)) {
                core.info(`Comment contains ignore string: ${ignoreString}`)
                return null
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
                }else{
                    core.error(error.response.data.message)
                }
            }

            const isCommenterExcluded = excludeUsersList.includes(ctx.payload.comment.user.login);
            if (isCommenterExcluded) {
                core.info(`Commenter is excluded: ${ctx.payload.comment.user.login}`)
                return null
            }

            const isCommenterAuthor = ctx.payload.comment.user.id === ctx.payload.issue.user.id;
            if (debug){
                core.info(`Commenter is author: ${isCommenterAuthor}`)
                core.info(`Commenter is org member: ${commenterIsOrgMember}`)
            }

            if (commenterIsOrgMember) {
                if (!hasLabel(label, issue)){
                    octokit.rest.issues.addLabels({
                        owner: ctx.repo.owner,
                        repo: ctx.repo.repo,
                        issue_number: ctx.payload.issue.number,
                        labels: [label]
                    })
                }
            } else {
                if (removeOnlyIfAuthor && !isCommenterAuthor) {
                    core.info(`Commenter is not author, skipping`)
                    return null
                }
                if (hasLabel(label, issue)) {
                    octokit.rest.issues.removeLabel({
                        owner: ctx.repo.owner,
                        repo: ctx.repo.repo,
                        issue_number: ctx.payload.issue.number,
                        name: label
                    })
                }
            }
        }

    } catch (error) {
        core.setFailed(error.message);
    }
})()
