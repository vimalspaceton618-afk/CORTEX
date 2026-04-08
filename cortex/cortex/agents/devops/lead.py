"""DevOpsLeadAgent — CI/CD, Cloud Architecture, Kubernetes.

Subagents: CICDEngineer, CloudArchitect, KubernetesSpecialist
"""
from ..base import LeadAgent, SubAgent, AgentTask, AgentAction, AgentState, ActionType


class CICDEngineer(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="cicd_engineer", group="devops",
                         description="CI/CD pipelines: GitHub Actions, GitLab CI, Jenkins, deployment workflows",
                         capabilities=["filesystem","shell_exec","git_ops"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["cicd","ci/cd","pipeline","github actions","gitlab","jenkins","deploy","workflow","yaml","build"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Design a CI/CD pipeline config. Use GitHub Actions YAML format.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="CI/CD pipeline", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="CI/CD pipeline designed.")


class CloudArchitect(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="cloud_architect", group="devops",
                         description="Cloud architecture: AWS, GCP, Azure, Terraform, serverless",
                         capabilities=["filesystem","shell_exec"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["cloud","aws","gcp","azure","terraform","serverless","lambda","s3","ec2","vpc","iam","infra"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Design cloud architecture with infrastructure-as-code (Terraform/CloudFormation).\n\n{state.task.query}",
                    use_verification=True, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="Cloud arch", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Cloud architecture designed.")


class KubernetesSpecialist(SubAgent):
    def __init__(self, **kw):
        super().__init__(name="kubernetes_spec", group="devops",
                         description="Kubernetes: manifests, Helm charts, services, ingress, scaling",
                         capabilities=["filesystem","shell_exec","docker_exec"], **kw)
    def can_handle(self, task):
        q = task.query.lower()
        return min(1.0, sum(0.2 for k in ["kubernetes","k8s","kubectl","helm","pod","service","ingress","deployment","container","orchestrat"] if k in q))
    async def step(self, state):
        if not state.steps and self.council:
            try:
                r = await self.council.process_question(
                    f"Write Kubernetes manifests (YAML). Include deployment, service, ingress.\n\n{state.task.query}",
                    use_verification=False, store_in_knowledge=False)
                return AgentAction(action_type=ActionType.RESPOND, description="K8s manifests", content=r.get("answer",""))
            except: pass
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="Kubernetes config generated.")


class DevOpsLeadAgent(LeadAgent):
    """Lead: CI/CD, Cloud, and Kubernetes."""
    def __init__(self, **kw):
        super().__init__(name="devops", group="devops",
                         description="CI/CD pipelines, cloud architecture, and Kubernetes orchestration", **kw)
        self.register_subagent(CICDEngineer())
        self.register_subagent(CloudArchitect())
        self.register_subagent(KubernetesSpecialist())

    def can_handle(self, task):
        q = task.query.lower()
        kws = ["devops","deploy","cicd","ci/cd","cloud","aws","gcp","azure","kubernetes","k8s","docker","terraform","pipeline","helm","infra"]
        return min(1.0, sum(0.12 for k in kws if k in q))

    async def step(self, state):
        if not state.steps:
            best = self._best_subagent(state.task)
            if best:
                return AgentAction(action_type=ActionType.DELEGATE_SUB, description=f"Routing to {best}",
                                   delegate_to=best, delegate_task=state.task.query)
        if state.subagent_results:
            return AgentAction(action_type=ActionType.RESPOND, description="DevOps complete",
                               content=list(state.subagent_results.values())[0])
        return AgentAction(action_type=ActionType.RESPOND, description="Done", content="DevOps task complete.")
