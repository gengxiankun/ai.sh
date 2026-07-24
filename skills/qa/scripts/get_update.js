execute = async function(args, context) {
  try {
    var res = await fetch('/updates.json')
    if (!res.ok) return '无法获取更新日志。'
    var updates = await res.json()
    if (!updates || !updates.length) return '暂无更新记录。'

    var recent = updates.slice(-10).reverse()

    var grouped = {}
    for (var i = 0; i < recent.length; i++) {
      var u = recent[i]
      if (!grouped[u.date]) grouped[u.date] = []
      grouped[u.date].push(u.message)
    }

    var lines = []
    var dates = Object.keys(grouped).sort().reverse()
    for (var j = 0; j < dates.length; j++) {
      var d = dates[j]
      lines.push('**' + d + '**')
      for (var k = 0; k < grouped[d].length; k++) {
        lines.push('  \u00B7 ' + grouped[d][k])
      }
      lines.push('')
    }

    return lines.join('\n')
  } catch (e) {
    return '获取更新日志失败: ' + e.message
  }
}
