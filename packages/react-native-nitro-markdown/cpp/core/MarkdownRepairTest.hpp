#pragma once

#include <cstddef>
#include <string>

namespace NitroMarkdownRepairTests {

struct Result {
  std::size_t testCases = 0;
  std::size_t checks = 0;
  std::size_t failures = 0;
  std::string firstFailure;
};

Result runAll();

} // namespace NitroMarkdownRepairTests
