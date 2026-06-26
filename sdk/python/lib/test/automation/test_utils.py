# Copyright 2016, Pulumi Corporation.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import subprocess
import uuid
from contextlib import contextmanager

from pulumi.automation import Stack, fully_qualified_stack_name


@contextmanager
def stack_cleanup(stack: Stack, destroy: bool = True):
    """Context manager that ensures a stack is destroyed and removed after use.

    Usage:
        stack = create_stack(stack_name, work_dir=work_dir)
        with stack_cleanup(stack):
            stack.up()
            # ... assertions ...

    Set destroy=False to skip the destroy step.
    """
    try:
        yield stack
    finally:
        try:
            if destroy:
                stack.destroy()
        finally:
            stack.workspace.remove_stack(stack.name, force=True)


def get_local_pulumi_org() -> str:
    default_org = "poolumi"
    try:
    	local_org = subprocess.run(
           ["pulumi whoami --json | jq -r '.organizations[0]'"],
           shell=True,
           capture_output=True,
           text=True,
           check=True
    	)
    except subprocess.CalledProcessError as e:
        print(f"Command failed with exit code {e.returncode}")

    print(" local is ", local_org)
    if local_org is not None:
        if local_org.stdout.strip() != "null":
        	default_org = local_org.stdout.strip() 

    return default_org

def get_test_org() -> str:
    test_org = os.getenv("PULUMI_TEST_ORG")

    if test_org is None:
    	if os.getenv("PULUMI_ACCESS_TOKEN") is None:
        	return get_local_pulumi_org()

    return test_org

def get_test_suffix() -> str:
    return str(uuid.uuid4())


def stack_namer(project_name: str) -> str:
    return fully_qualified_stack_name(
        get_test_org(), project_name, f"int_test_{get_test_suffix()}"
    )
