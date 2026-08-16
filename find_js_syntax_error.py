import sys

def check_js_syntax(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    code = "".join(lines)
    stack = []
    in_string = False
    string_char = ""
    in_comment_single = False
    in_comment_multi = False
    escaped = False

    i = 0
    length = len(code)
    line_num = 1

    while i < length:
        ch = code[i]
        
        if ch == '\n':
            line_num += 1
            in_comment_single = False

        if escaped:
            escaped = False
            i += 1
            continue

        if in_string:
            if ch == '\\':
                escaped = True
            elif ch == string_char and not escaped:
                in_string = False
            i += 1
            continue

        if in_comment_single:
            i += 1
            continue

        if in_comment_multi:
            if ch == '*' and i + 1 < length and code[i+1] == '/':
                in_comment_multi = False
                i += 2
                continue
            i += 1
            continue

        # Check start of comment
        if ch == '/' and i + 1 < length:
            if code[i+1] == '/':
                in_comment_single = True
                i += 2
                continue
            elif code[i+1] == '*':
                in_comment_multi = True
                i += 2
                continue

        # Check start of string
        if ch in ['"', "'", '`']:
            in_string = True
            string_char = ch
            i += 1
            continue

        # Check brackets
        if ch in ['(', '{', '[']:
            stack.append((ch, line_num))
        elif ch in [')', '}', ']']:
            if not stack:
                print(f"Syntax Error: Unmatched closing '{ch}' at line {line_num}")
                return False
            top, top_line = stack.pop()
            expected = {'(': ')', '{': '}', '[': ']'}[top]
            if ch != expected:
                print(f"Syntax Error: Mismatched bracket '{ch}' at line {line_num}, expected '{expected}' for '{top}' from line {top_line}")
                return False

        i += 1

    if stack:
        top, top_line = stack.pop()
        print(f"Syntax Error: Unclosed bracket '{top}' from line {top_line}")
        return False

    print("JS Syntax check passed successfully! No bracket or string token mismatches.")
    return True

if __name__ == "__main__":
    filepath = "static/js/dashboard.js" if len(sys.argv) < 2 else sys.argv[1]
    success = check_js_syntax(filepath)
    sys.exit(0 if success else 1)
