def greet_user(name: str) -> str:
    if not name or name.strip() == "":
        return "Hello, friend!"
    return f"Hello, {name}!"
