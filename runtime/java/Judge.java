import java.lang.reflect.Array;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Queue;

/**
 * Support library compiled alongside user code on every run.
 *
 * Two responsibilities: build the values the TypeScript emitters reference, and
 * decide equality.
 *
 * Equality deliberately lives here rather than in TypeScript. After a JSON
 * round-trip you cannot distinguish int from long from double, and 1.0 === 1 in
 * JavaScript, so comparing on that side produces false passes. The harness
 * sends back only a boolean plus rendered strings, which keeps the TypeScript
 * correctness surface tiny.
 *
 * Comparison dispatches on the runtime type rather than on the authored
 * JavaType. One universal comparator that inspects what it is actually holding
 * is far harder to get wrong than seven type-specific ones wired up by codegen.
 */
public final class Judge {

    /** Control character, so no realistic user output can collide with it. */
    public static final String SENTINEL = "\u0001CASE\u0001";

    private Judge() {}

    // ------------------------------------------------------------- builders

    /**
     * Builds a mutable list. Emitters always pass an explicit type witness
     * (Judge.&lt;Integer&gt;list(...)) so inference cannot fail on an empty
     * list or a lone null element.
     *
     * ArrayList rather than List.of(...) because List.of is immutable and
     * rejects nulls, both of which break real problems.
     */
    @SafeVarargs
    public static <T> List<T> list(T... values) {
        List<T> out = new ArrayList<>(values.length);
        for (T v : values) {
            out.add(v);
        }
        return out;
    }

    /** Builds a map from parallel key/value arrays, preserving authored order. */
    public static <K, V> Map<K, V> map(K[] keys, V[] values) {
        if (keys.length != values.length) {
            throw new IllegalArgumentException(
                "map(): " + keys.length + " keys but " + values.length + " values");
        }
        Map<K, V> out = new LinkedHashMap<>();
        for (int i = 0; i < keys.length; i++) {
            out.put(keys[i], values[i]);
        }
        return out;
    }

    /**
     * Builds a tree from a LeetCode-style level-order array where null marks an
     * absent child: [3, 9, 20, null, null, 15, 7].
     *
     * This is NOT a heap layout — nulls do not reserve slots for children, so
     * the array is consumed with a queue.
     */
    public static TreeNode tree(Integer[] levelOrder) {
        if (levelOrder.length == 0 || levelOrder[0] == null) {
            return null;
        }
        TreeNode root = new TreeNode(levelOrder[0]);
        Queue<TreeNode> pending = new LinkedList<>();
        pending.add(root);

        int i = 1;
        while (!pending.isEmpty() && i < levelOrder.length) {
            TreeNode node = pending.remove();
            if (i < levelOrder.length) {
                Integer v = levelOrder[i++];
                if (v != null) {
                    node.left = new TreeNode(v);
                    pending.add(node.left);
                }
            }
            if (i < levelOrder.length) {
                Integer v = levelOrder[i++];
                if (v != null) {
                    node.right = new TreeNode(v);
                    pending.add(node.right);
                }
            }
        }
        return root;
    }

    /** Serialises a tree to level-order with null holes, trailing nulls trimmed. */
    public static Integer[] treeToArray(TreeNode root) {
        List<Integer> out = new ArrayList<>();
        if (root == null) {
            return new Integer[0];
        }
        Queue<TreeNode> pending = new LinkedList<>();
        pending.add(root);
        int guard = 0;
        while (!pending.isEmpty()) {
            if (++guard > 1_000_000) {
                throw new IllegalStateException("tree is cyclic or unreasonably large");
            }
            TreeNode node = pending.remove();
            if (node == null) {
                out.add(null);
                continue;
            }
            out.add(node.val);
            pending.add(node.left);
            pending.add(node.right);
        }
        int end = out.size();
        while (end > 0 && out.get(end - 1) == null) {
            end--;
        }
        return out.subList(0, end).toArray(new Integer[0]);
    }

    /** Builds a singly linked list from its values. */
    public static ListNode linked(Integer[] values) {
        ListNode head = null;
        ListNode tail = null;
        for (Integer v : values) {
            ListNode node = new ListNode(v);
            if (head == null) {
                head = node;
            } else {
                tail.next = node;
            }
            tail = node;
        }
        return head;
    }

    /**
     * Serialises a linked list to its values.
     *
     * Cycle-detecting on purpose: a buggy solution that links a node to itself
     * would otherwise spin here until the runner's timeout kills it, and the
     * learner would see "timed out" instead of "you made a cycle".
     */
    public static Integer[] linkedToArray(ListNode head) {
        List<Integer> out = new ArrayList<>();
        ListNode slow = head;
        ListNode fast = head;
        while (slow != null) {
            out.add(slow.val);
            slow = slow.next;
            if (fast != null && fast.next != null) {
                fast = fast.next.next;
                if (fast == slow && fast != null) {
                    throw new IllegalStateException("linked list contains a cycle");
                }
            }
        }
        return out.toArray(new Integer[0]);
    }

    // ---------------------------------------------------------- comparison

    /** Deep exact equality across arrays, collections, maps, trees and lists. */
    public static boolean eq(Object a, Object b) {
        return deepEquals(a, b, -1.0);
    }

    /** Deep equality with a tolerance applied wherever a floating value is met. */
    public static boolean approx(Object a, Object b, double epsilon) {
        return deepEquals(a, b, epsilon);
    }

    private static boolean deepEquals(Object a, Object b, double eps) {
        if (a == b) {
            return true;
        }
        if (a == null || b == null) {
            return false;
        }

        if (a instanceof TreeNode || b instanceof TreeNode) {
            if (!(a instanceof TreeNode) || !(b instanceof TreeNode)) {
                return false;
            }
            return deepEquals(treeToArray((TreeNode) a), treeToArray((TreeNode) b), eps);
        }
        if (a instanceof ListNode || b instanceof ListNode) {
            if (!(a instanceof ListNode) || !(b instanceof ListNode)) {
                return false;
            }
            return deepEquals(linkedToArray((ListNode) a), linkedToArray((ListNode) b), eps);
        }

        if (a.getClass().isArray() || b.getClass().isArray()) {
            if (!a.getClass().isArray() || !b.getClass().isArray()) {
                return false;
            }
            int n = Array.getLength(a);
            if (n != Array.getLength(b)) {
                return false;
            }
            for (int i = 0; i < n; i++) {
                if (!deepEquals(Array.get(a, i), Array.get(b, i), eps)) {
                    return false;
                }
            }
            return true;
        }

        if (a instanceof Collection && b instanceof Collection) {
            Collection<?> ca = (Collection<?>) a;
            Collection<?> cb = (Collection<?>) b;
            if (ca.size() != cb.size()) {
                return false;
            }
            java.util.Iterator<?> ia = ca.iterator();
            java.util.Iterator<?> ib = cb.iterator();
            while (ia.hasNext()) {
                if (!deepEquals(ia.next(), ib.next(), eps)) {
                    return false;
                }
            }
            return true;
        }

        if (a instanceof Map && b instanceof Map) {
            Map<?, ?> ma = (Map<?, ?>) a;
            Map<?, ?> mb = (Map<?, ?>) b;
            if (ma.size() != mb.size()) {
                return false;
            }
            for (Map.Entry<?, ?> e : ma.entrySet()) {
                if (!mb.containsKey(e.getKey())) {
                    return false;
                }
                if (!deepEquals(e.getValue(), mb.get(e.getKey()), eps)) {
                    return false;
                }
            }
            return true;
        }

        if (a instanceof Number && b instanceof Number) {
            return numbersEqual((Number) a, (Number) b, eps);
        }
        return a.equals(b);
    }

    /**
     * Compares numbers by value rather than by box type, so an Integer 1 and a
     * Long 1 agree. Without this, a solution returning long where the author
     * wrote int would fail for a reason the learner cannot see.
     */
    private static boolean numbersEqual(Number a, Number b, double eps) {
        boolean floating = isFloating(a) || isFloating(b);
        if (!floating) {
            return a.longValue() == b.longValue();
        }
        double x = a.doubleValue();
        double y = b.doubleValue();
        if (Double.isNaN(x) && Double.isNaN(y)) {
            return true;
        }
        if (Double.isInfinite(x) || Double.isInfinite(y)) {
            return x == y;
        }
        if (eps < 0) {
            return x == y;
        }
        double diff = Math.abs(x - y);
        if (diff <= eps) {
            return true;
        }
        // Relative fallback, so a tolerance chosen for values near 1 does not
        // silently become impossible to satisfy at 1e9.
        double scale = Math.max(Math.abs(x), Math.abs(y));
        return diff <= eps * scale;
    }

    private static boolean isFloating(Number n) {
        return n instanceof Double || n instanceof Float;
    }

    /** Multiset equality: same elements, any order. */
    public static boolean unordered(Object a, Object b) {
        List<String> ka = canonicalKeys(a, false);
        List<String> kb = canonicalKeys(b, false);
        if (ka == null || kb == null) {
            return false;
        }
        java.util.Collections.sort(ka);
        java.util.Collections.sort(kb);
        return ka.equals(kb);
    }

    /** Multiset equality at both levels: group-anagrams, subsets, permutations. */
    public static boolean unorderedNested(Object a, Object b) {
        List<String> ka = canonicalKeys(a, true);
        List<String> kb = canonicalKeys(b, true);
        if (ka == null || kb == null) {
            return false;
        }
        java.util.Collections.sort(ka);
        java.util.Collections.sort(kb);
        return ka.equals(kb);
    }

    /**
     * Renders each element to a string key. Rendering is the canonical form
     * here — it already normalises across arrays and lists, so an int[][] and a
     * List&lt;List&lt;Integer&gt;&gt; holding the same values compare equal.
     */
    private static List<String> canonicalKeys(Object v, boolean sortInner) {
        List<Object> items = asList(v);
        if (items == null) {
            return null;
        }
        List<String> keys = new ArrayList<>(items.size());
        for (Object item : items) {
            if (sortInner) {
                List<Object> inner = asList(item);
                if (inner != null) {
                    List<String> innerKeys = new ArrayList<>(inner.size());
                    for (Object x : inner) {
                        innerKeys.add(render(x));
                    }
                    java.util.Collections.sort(innerKeys);
                    keys.add(innerKeys.toString());
                    continue;
                }
            }
            keys.add(render(item));
        }
        return keys;
    }

    /** Views arrays and collections uniformly; null for anything else. */
    private static List<Object> asList(Object v) {
        if (v == null) {
            return null;
        }
        if (v.getClass().isArray()) {
            int n = Array.getLength(v);
            List<Object> out = new ArrayList<>(n);
            for (int i = 0; i < n; i++) {
                out.add(Array.get(v, i));
            }
            return out;
        }
        if (v instanceof Collection) {
            return new ArrayList<>((Collection<?>) v);
        }
        return null;
    }

    /** True when `actual` matches any one of the acceptable answers. */
    public static boolean anyOf(Object actual, Object[] alternatives) {
        for (Object alt : alternatives) {
            if (eq(actual, alt)) {
                return true;
            }
        }
        return false;
    }

    // ----------------------------------------------------------- rendering

    /** Human-facing rendering, used for both display and unordered keys. */
    public static String render(Object v) {
        if (v == null) {
            return "null";
        }
        if (v instanceof String) {
            return "\"" + v + "\"";
        }
        if (v instanceof Character) {
            return "'" + v + "'";
        }
        if (v instanceof TreeNode) {
            return render(treeToArray((TreeNode) v));
        }
        if (v instanceof ListNode) {
            return render(linkedToArray((ListNode) v));
        }
        if (v.getClass().isArray()) {
            StringBuilder sb = new StringBuilder("[");
            int n = Array.getLength(v);
            for (int i = 0; i < n; i++) {
                if (i > 0) {
                    sb.append(", ");
                }
                sb.append(render(Array.get(v, i)));
            }
            return sb.append("]").toString();
        }
        if (v instanceof Collection) {
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (Object o : (Collection<?>) v) {
                if (!first) {
                    sb.append(", ");
                }
                first = false;
                sb.append(render(o));
            }
            return sb.append("]").toString();
        }
        if (v instanceof Map) {
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) {
                if (!first) {
                    sb.append(", ");
                }
                first = false;
                sb.append(render(e.getKey())).append("=").append(render(e.getValue()));
            }
            return sb.append("}").toString();
        }
        return String.valueOf(v);
    }

    /**
     * Trims a throwable to its type, message, and the frames in the learner's
     * own code. Harness frames are noise — they did not write them and cannot
     * act on them.
     */
    public static String trim(Throwable t) {
        StringBuilder sb = new StringBuilder(t.getClass().getName());
        if (t.getMessage() != null) {
            sb.append(": ").append(t.getMessage());
        }
        StackTraceElement[] frames = t.getStackTrace();
        int shown = 0;
        for (StackTraceElement f : frames) {
            if (f.getClassName().equals("Main") || f.getClassName().equals("Judge")) {
                break;
            }
            sb.append("\n    at ").append(f);
            if (++shown >= 8) {
                sb.append("\n    ...");
                break;
            }
        }
        return sb.toString();
    }

    // ------------------------------------------------------------ protocol

    /**
     * Writes one case result as a sentinel-prefixed JSON line and flushes.
     *
     * Flushing per case is what lets the UI stream results, and what makes a
     * hang on case 7 still show cases 1-6 instead of a bare timeout.
     */
    public static void emit(
            int index,
            boolean passed,
            String actual,
            String expected,
            String error,
            long nanos) {
        StringBuilder sb = new StringBuilder(SENTINEL);
        sb.append("{\"index\":").append(index);
        sb.append(",\"passed\":").append(passed);
        sb.append(",\"actual\":").append(json(actual));
        sb.append(",\"expected\":").append(json(expected));
        sb.append(",\"error\":").append(json(error));
        sb.append(",\"durationMs\":").append(nanos / 1_000_000.0);
        sb.append("}");
        System.out.println(sb);
        System.out.flush();
    }

    private static String json(String s) {
        if (s == null) {
            return "null";
        }
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.append("\"").toString();
    }
}
