/**
 * The binary tree node used by every tree problem.
 *
 * Field names match the LeetCode convention deliberately: learners arrive
 * already knowing `val`, `left` and `right`, and so does every model that
 * writes content for this app.
 */
public class TreeNode {
    public int val;
    public TreeNode left;
    public TreeNode right;

    public TreeNode() {}

    public TreeNode(int val) {
        this.val = val;
    }

    public TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}
