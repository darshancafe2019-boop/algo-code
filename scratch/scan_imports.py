import ast
import os
import sys

def get_imports_from_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read(), filename=filepath)
        except Exception as e:
            return set()
    imports = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name.split('.')[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.add(node.module.split('.')[0])
    return imports

all_imports = set()
for root, dirs, files in os.walk("src"):
    for file in files:
        if file.endswith(".py"):
            all_imports.update(get_imports_from_file(os.path.join(root, file)))

all_imports.update(get_imports_from_file("dashboard.py"))

stdlib = sys.stdlib_module_names if hasattr(sys, "stdlib_module_names") else set()
third_party = {imp for imp in all_imports if imp not in stdlib and imp not in ["src", "dashboard", "data", "tests", "config"]}
print("Third-party imports detected in codebase:")
for imp in sorted(third_party):
    print(f"  • {imp}")
