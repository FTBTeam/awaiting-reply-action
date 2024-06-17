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

const debugLog = (message) => {
    const debug = Boolean(core.getInput('debug'));
    if (debug) core.info(message)
}

(async () => {
    try {
        const debug = Boolean(core.getInput('debug'));
        if (debug){
            core.info(`Debug enabled: ${debug}`)
            // Get the JSON webhook payload for the event that triggered the workflow
            const payload = JSON.stringify(github.context.payload, undefined, 2)
            console.log(`The event payload: ${payload}`);
        }

        const label = core.getInput('label');
        if (!label) return core.setFailed('Label is required')
        if (debug) core.info(`Label to toggle: ${label}`)

        const ignoreLabels = core.getInput('ignore-labels');
        if (debug) core.info(`Ignore labels: ${ignoreLabels}`)

        const excludeUsers = core.getInput('exclude-users');
        if (debug) core.info(`Exclude users: ${excludeUsers}`)

        const removeOnlyIfAuthor = Boolean(core.getInput('remove-only-if-author'));
        if (debug) core.info(`Remove only if author: ${removeOnlyIfAuthor}`)

        const octokit = getOctokit();
        const ctx = github.context;

        if (debug) core.info(`Event: ${ctx.eventName}`)

        if (ctx.eventName === 'issue_comment' && ctx.payload.action === 'created'){
            debugLog('Issue comment created event detected')
            if (ignoreLabels && hasLabel(ignoreLabels, ctx.payload.issue)){
                core.info(`Issue has ignore label: ${ignoreLabels}`)
                return null
            }

            const issue = await octokit.rest.issues.get({
                owner: ctx.repo.owner,
                repo: ctx.repo.repo,
                issue_number: ctx.payload.issue.number
            })
            if (debug) core.info(JSON.stringify(issue, undefined, 2))

        }

    } catch (error) {
        core.setFailed(error.message);
    }
})()
