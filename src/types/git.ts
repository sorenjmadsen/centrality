export interface GitCommit {
  hash: string          // full 40-char sha
  shortHash: string     // 7-char
  message: string
  author: string
  date: string          // ISO 8601
  changedFiles: string[] // relative paths
}

export interface GitDiff {
  commitHash: string
  unified: string       // raw unified diff text
}
