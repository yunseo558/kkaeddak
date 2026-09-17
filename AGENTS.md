# KKAEDDAK Repository Rules

이 파일은 저장소 전체에 적용된다. 사용자의 명시적 요청이 이 규칙보다 우선한다.

## Git 작업 원칙

- 사용자 변경과 관계없는 파일은 스테이징하거나 수정하지 않는다.
- 기능과 수정 작업은 가능한 한 별도 브랜치에서 진행한다.
- 브랜치 이름은 `<type>/<short-kebab-case>` 형식을 사용한다. 예: `feat/demo-session`, `fix/revision-conflict`.
- 사용자가 명시적으로 요청하지 않은 force push와 기록 재작성은 금지한다.
- 커밋, 푸시, PR 생성 직전에 다음 한 줄을 사용자에게 알린다.
  - `Git 작업 예정: <branch> | <commit/push/PR> | <메시지 또는 제목>`

## 커밋

- 커밋 메시지는 Conventional Commits 형식을 사용한다.
  - `<type>(<scope>): <summary>`
  - scope가 불필요하면 `<type>: <summary>`를 사용한다.
- type은 `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `perf` 중 하나를 사용한다.
- summary는 영어 명령형으로 간결하게 작성하고 마침표를 붙이지 않는다.
- 하나의 커밋에는 하나의 논리적 변경만 담는다.
- 커밋 전에는 `git status --short`와 staged diff를 확인한다.
- 커밋 후에는 실제 커밋 해시와 제목을 다시 확인한다.

## 푸시

- 기본 푸시는 현재 작업 브랜치를 `origin`에 올리고 upstream을 설정한다.
- 푸시 전에는 브랜치, 원격 저장소, 포함될 커밋을 확인한다.
- 푸시 후에는 로컬 HEAD와 upstream HEAD가 같은지 확인한다.
- 검증 없이 푸시 성공을 보고하지 않는다.

## PR

- PR 제목은 커밋과 같은 Conventional Commits 형식을 사용한다.
- PR 본문은 아래 두 섹션만 사용하는 것을 기본으로 한다.

```markdown
## 변경
- 핵심 변경 1~3개

## 검증
- 실행한 검증과 결과
```

- 배경 설명, 구현 상세, 스크린샷, 관련 이슈는 실제로 필요한 경우에만 추가한다.
- 테스트를 실행하지 못했다면 `미실행 — <이유>`라고 명시한다.
- PR 생성 후 base, head, 제목, 본문, URL을 확인한다.

## 완료 보고

Git 작업이 포함된 응답에는 수행한 항목만 아래 형식으로 간단히 보고한다.

```text
커밋: <hash> <title>
푸시: <local-branch> -> <remote-branch>
PR: <URL 또는 생성하지 않음>
검증: <명령과 결과>
```

확인하지 못한 항목은 성공한 것처럼 표현하지 않는다.
